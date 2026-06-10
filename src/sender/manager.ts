/**
 * Sender loop manager — holds the mission stream open, sends, acks, reconnects.
 *
 * This is the plugin-side analogue of the daemon's daemon.py run() loop, adapted
 * to a long-lived gateway: a single background async task per process, started
 * and stopped by tools rather than a CLI. It owns no platform knowledge
 * (redditSender.ts) and no wire format (sse.ts) — it wires them together with a
 * reconnect-with-backoff policy and at-least-once delivery handling.
 *
 * Delivery model: the brain streams every 'approved' mission and only stops once
 * it receives an ack. Within one running process a `seen` set guarantees each
 * mission is posted at most once, even across reconnects — so a lost ack never
 * causes a double-send (the cardinal outreach sin); at worst it leaves the
 * brain's copy 'approved' for later reconciliation. Exactly-once across gateway
 * *restarts* needs brain-side idempotency and is tracked separately (#30).
 */
import { api } from '../api/client'
import { API_URL, OPERATOR_KEY, redditReady } from '../config'
import { parseSse, streamLines } from './sse'
import { Mission, RedditSender, SendResult } from './redditSender'

const BACKOFF_START_MS = 1_000
const BACKOFF_MAX_MS = 60_000
const ACK_RETRIES = 3

interface SenderStats {
  startedAt: string | null
  connected: boolean
  paused: boolean
  sent: number
  failed: number
  skipped: number
  lastEvent: string | null
  lastError: string | null
}

function freshStats(): SenderStats {
  return {
    startedAt: null,
    connected: false,
    paused: false,
    sent: 0,
    failed: 0,
    skipped: 0,
    lastEvent: null,
    lastError: null,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function log(msg: string): void {
  console.log(`[SignalPipe sender] ${msg}`)
}

class SenderManager {
  private running = false
  private stopRequested = false
  private dryRun = false
  private sender = new RedditSender()
  private seen = new Set<string>() // mission ids fully handled this session
  private skipLogged = new Set<string>() // skip reasons already logged once
  private abort: AbortController | null = null
  private stats: SenderStats = freshStats()

  isRunning(): boolean {
    return this.running
  }

  start(dryRun = false): { ok: boolean; message: string } {
    if (this.running) {
      return { ok: false, message: 'Sender is already running. Call signalpipe_stop_sender first to restart it.' }
    }
    if (!redditReady()) {
      return {
        ok: false,
        message:
          'Reddit credentials not configured. Set REDDIT_CLIENT_ID, ' +
          'REDDIT_CLIENT_SECRET, REDDIT_USERNAME, and REDDIT_PASSWORD in the ' +
          'environment before starting the sender. These stay on this machine ' +
          'and are never sent to SignalPipe.',
      }
    }
    this.running = true
    this.stopRequested = false
    this.dryRun = dryRun
    this.seen = new Set()
    this.skipLogged = new Set()
    this.stats = freshStats()
    this.stats.startedAt = new Date().toISOString()
    // Fire-and-forget: the loop runs for the life of the gateway process.
    void this.loop()
    return {
      ok: true,
      message: dryRun
        ? 'Sender started in DRY-RUN mode — streaming approved Reddit missions and logging intended sends WITHOUT posting or acking.'
        : 'Sender started — streaming approved Reddit missions and posting them with your credentials.',
    }
  }

  stop(): { ok: boolean; message: string } {
    if (!this.running) {
      return { ok: false, message: 'Sender is not running.' }
    }
    this.stopRequested = true
    if (this.abort) this.abort.abort()
    return { ok: true, message: 'Stop requested — the sender will halt the mission stream and exit shortly.' }
  }

  status(): Record<string, unknown> {
    return {
      running: this.running,
      dry_run: this.dryRun,
      reddit_ready: redditReady(),
      started_at: this.stats.startedAt,
      connected: this.stats.connected,
      paused: this.stats.paused,
      sent: this.stats.sent,
      failed: this.stats.failed,
      skipped: this.stats.skipped,
      seen_this_session: this.seen.size,
      last_event: this.stats.lastEvent,
      last_error: this.stats.lastError,
    }
  }

  // --- the loop ---------------------------------------------------------
  private async loop(): Promise<void> {
    let backoff = BACKOFF_START_MS
    try {
      while (!this.stopRequested) {
        try {
          const res = await this.openStream()
          if (res.status === 401) {
            log('operator key rejected (401) — stopping sender. Check SIGNALPIPE_OPERATOR_KEY.')
            this.stats.lastError = 'unauthorized (401)'
            break
          }
          if (!res.ok || !res.body) {
            throw new Error(`stream open failed: HTTP ${res.status}`)
          }
          for await (const frame of parseSse(streamLines(res))) {
            if (this.stopRequested) break
            const fatal = await this.onFrame(frame, () => {
              backoff = BACKOFF_START_MS // healthy connection: fast reconnects
            })
            if (fatal) {
              this.stopRequested = true
              break
            }
          }
          // generator exhausted: stream closed cleanly → reconnect below
        } catch (e) {
          if (this.stopRequested) break // abort() during stop() — expected
          const msg = e instanceof Error ? e.message : String(e)
          this.stats.lastError = msg
          log(`stream error: ${msg}; reconnecting in ${Math.round(backoff / 1000)}s`)
        }
        this.stats.connected = false
        if (this.stopRequested) break
        await sleep(backoff)
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS)
      }
    } finally {
      this.running = false
      this.stats.connected = false
      log('sender stopped.')
    }
  }

  /** Handle one SSE frame. Returns true when the stream is fatally closed. */
  private async onFrame(frame: { event: string; data: Record<string, unknown> }, resetBackoff: () => void): Promise<boolean> {
    const { event, data } = frame
    this.stats.lastEvent = event
    if (event === 'connected') {
      resetBackoff()
      this.stats.connected = true
      this.stats.paused = false
      log(`connected — auto-fire threshold ${String(data.auto_threshold)}`)
    } else if (event === 'mission_ready') {
      const payload = (data.payload as Record<string, unknown>) || data
      await this.handle(payload as unknown as Mission)
    } else if (event === 'heartbeat') {
      this.stats.paused = Boolean(data.paused)
      if (data.paused) log(`stream paused (backoff until ${String(data.backoff_until)})`)
    } else if (event === 'shutdown') {
      const reason = data.reason
      if (reason === 'unauthorized') {
        log('brain closed stream: unauthorized — stopping sender.')
        this.stats.lastError = 'unauthorized'
        return true
      }
      log(`brain closed stream (${String(reason)}); reconnecting.`)
    }
    return false
  }

  private async handle(mission: Mission): Promise<void> {
    const mid = mission.id
    if (!mid) {
      log('mission_ready with no id — ignoring.')
      return
    }
    if (this.seen.has(mid)) return // already handled this session (at-least-once stream)

    const channel = mission.outreach_channel || 'manual'
    let result: SendResult
    try {
      result = await this.sender.send(mission, this.dryRun)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result = { outcome: 'failed', errorClass: 'unknown', detail: msg, sent: true }
    }

    // Skip: nothing was sent. Don't ack, don't mark seen — the mission stays
    // 'approved' on the brain and retries on a future reconnect (e.g. once a
    // daily cap resets).
    if (result.outcome === 'skip') {
      if (!this.skipLogged.has(mid)) {
        log(`skip ${mid} [${channel}]: ${result.detail}`)
        this.skipLogged.add(mid)
      }
      this.stats.skipped += 1
      return
    }

    if (this.dryRun) {
      log(`would-send ${mid} [${channel}]: ${result.detail}`)
      this.seen.add(mid)
      return
    }

    // Past this point the mission is processed exactly once this session,
    // regardless of whether the ack lands — so we can never double-send.
    this.seen.add(mid)

    if (result.outcome === 'success') {
      this.stats.sent += 1
      log(`sent ${mid} [${channel}]: ${result.detail}`)
      await this.ack(mid, 'success', undefined, result.detail)
    } else {
      this.stats.failed += 1
      log(`failed ${mid} [${channel}] (${result.errorClass}): ${result.detail}`)
      await this.ack(mid, 'failed', result.errorClass, result.detail)
    }
  }

  /**
   * Best-effort ack with a short retry. The mission is already in `seen`, so a
   * lost ack never re-triggers a send; at worst the brain's copy stays
   * 'approved' for later reconciliation.
   */
  private async ack(mid: string, outcome: string, errorClass?: string, platformResponse?: string): Promise<void> {
    const body: Record<string, unknown> = { outcome }
    if (errorClass) body.error_class = errorClass
    if (platformResponse) body.platform_response = platformResponse
    for (let attempt = 0; attempt < ACK_RETRIES; attempt++) {
      try {
        await api.post(`/v4/missions/${encodeURIComponent(mid)}/ack`, body)
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('401')) {
          // Fatal auth failure, but the mission is already in `seen`; stop
          // retrying and let the loop's next stream-open surface the 401.
          this.stats.lastError = 'unauthorized on ack'
          return
        }
        if (attempt === ACK_RETRIES - 1) {
          log(`ack(${outcome}) for ${mid} failed after retries: ${msg}`)
          return
        }
        await sleep(2_000)
      }
    }
  }

  /**
   * Open the mission SSE stream. Deliberately NOT routed through api/client.ts:
   * that helper imposes a 10s AbortController timeout suited to short request/
   * response calls, whereas this stream must stay open indefinitely. We use a
   * dedicated AbortController so stop() can tear the connection down at once.
   */
  private async openStream(): Promise<Response> {
    this.abort = new AbortController()
    return fetch(`${API_URL}/v4/missions/stream`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${OPERATOR_KEY}`,
        Accept: 'text/event-stream',
      },
      signal: this.abort.signal,
    })
  }
}

// Singleton — one sender per gateway process.
export const senderManager = new SenderManager()
