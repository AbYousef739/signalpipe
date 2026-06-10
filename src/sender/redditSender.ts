/**
 * Reddit sender — posts pre-drafted missions with the operator's OWN snoowrap
 * credentials. This is the only plugin module that touches platform creds, and
 * they NEVER leave this machine.
 *
 * Mirrors the daemon's senders.py (Reddit half): same channel handling, same
 * daily-cap-as-skip semantics, same error classification, same handle
 * normalization, same post-send jitter. The plugin sender is Reddit-only by
 * design (v4 plan: "same warehouse, two doors") — a twitter_reply mission is
 * left for the standalone signalpipe-daemon and skipped here.
 *
 * Nothing here scores, drafts, or stores anything. A mission arrives
 * pre-drafted from the brain; we post the text and report the outcome.
 */
import {
  MAX_REDDIT_COMMENTS_PER_DAY,
  MAX_REDDIT_DMS_PER_DAY,
  REDDIT,
  redditReady,
} from '../config'

// Outcomes the brain understands, plus a local-only "skip" that is never acked.
export const SUCCESS = 'success' as const
export const FAILED = 'failed' as const
export const SKIP = 'skip' as const

export interface SendResult {
  outcome: 'success' | 'failed' | 'skip'
  errorClass?: string
  detail?: string
  sent: boolean // true only once we have actually hit the platform API
}

export interface MissionTarget {
  title?: string
  url?: string
  author?: string
  platform?: string
}

export interface Mission {
  id: string
  outreach_channel?: string
  draft_content?: string
  fused_score?: number
  status?: string
  target?: MissionTarget
}

/**
 * Map a platform exception string to the brain's error_class vocabulary.
 * The brain pauses a tenant's stream on "banned" (1h) or "rate_limited" (5m);
 * "unknown" is reported for the audit trail but triggers no backoff.
 */
export function classifyError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('ratelimit') || m.includes('rate limit') || m.includes('429') || m.includes('too many')) {
    return 'rate_limited'
  }
  for (const w of ['forbidden', 'banned', 'suspend', '403', '401', 'blocked', 'not allowed']) {
    if (m.includes(w)) return 'banned'
  }
  return 'unknown'
}

/**
 * Normalize a Reddit handle: 'u/spez' / '/u/spez' -> 'spez'.
 * Prefix slicing, NOT a character-set strip — must not eat a leading 'u' from
 * a name like 'umbrella'.
 */
export function stripU(author: string): string {
  const a = author.trim()
  if (a.startsWith('/u/')) return a.slice(3)
  if (a.startsWith('u/')) return a.slice(2)
  return a
}

/** Pull a base36 submission id out of a reddit comment/permalink URL. */
export function submissionIdFromUrl(url: string): string | null {
  const m = url.match(/\/comments\/([a-z0-9]+)/i)
  return m ? m[1] : null
}

function currentDayKey(): string {
  const d = new Date() // local time — caps reset at local midnight
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function jitterMs(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class RedditSender {
  // Lazily constructed snoowrap client; `any` because we require() it on first
  // use to keep snoowrap an optional, deferred dependency.
  private client: any = null
  private day: string = currentDayKey()
  private commentsSent = 0
  private dmsSent = 0

  // --- lazy client ------------------------------------------------------
  private reddit(): any {
    if (this.client === null) {
      // Lazy require: a Reddit-only operator never resolves a Twitter SDK, and
      // the gateway never pays snoowrap's load cost until the sender starts.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Snoowrap = require('snoowrap')
      this.client = new Snoowrap({
        userAgent: REDDIT.userAgent,
        clientId: REDDIT.clientId,
        clientSecret: REDDIT.clientSecret,
        username: REDDIT.username,
        password: REDDIT.password,
      })
    }
    return this.client
  }

  // --- daily caps -------------------------------------------------------
  private resetDaily(): void {
    const today = currentDayKey()
    if (today !== this.day) {
      this.day = today
      this.commentsSent = 0
      this.dmsSent = 0
    }
  }

  // --- dispatch ---------------------------------------------------------
  async send(mission: Mission, dryRun = false): Promise<SendResult> {
    this.resetDaily()
    const channel = mission.outreach_channel || 'manual'
    const draft = (mission.draft_content || '').trim()
    const target = mission.target || {}

    // 'manual' = the brain flagged this for a human. Never auto-send.
    if (channel === 'manual') {
      return { outcome: SKIP, detail: 'manual channel — operator handles', sent: false }
    }
    // The plugin sender is Reddit-only; twitter_reply belongs to the daemon.
    if (channel === 'twitter_reply') {
      return { outcome: SKIP, detail: 'twitter_reply — handled by the daemon, not the plugin', sent: false }
    }
    if (!draft) {
      return { outcome: FAILED, errorClass: 'config', detail: 'empty draft_content', sent: false }
    }
    if (channel === 'reddit_comment') return this.sendComment(draft, target, dryRun)
    if (channel === 'reddit_dm') return this.sendDm(draft, target, dryRun)

    return { outcome: FAILED, errorClass: 'config', detail: `unknown channel '${channel}'`, sent: false }
  }

  // --- per-channel ------------------------------------------------------
  private async sendComment(draft: string, target: MissionTarget, dryRun: boolean): Promise<SendResult> {
    if (!redditReady()) {
      return { outcome: FAILED, errorClass: 'config', detail: 'Reddit credentials not configured', sent: false }
    }
    if (this.commentsSent >= MAX_REDDIT_COMMENTS_PER_DAY) {
      // Skip, not fail: the mission stays 'approved' and retries after the
      // next local-midnight reset.
      return { outcome: SKIP, detail: 'daily reddit-comment cap reached', sent: false }
    }
    const url = (target.url || '').trim()
    const id = url ? submissionIdFromUrl(url) : null
    if (!id) {
      return { outcome: FAILED, errorClass: 'config', detail: `cannot parse submission id from '${url}'`, sent: false }
    }
    if (dryRun) {
      return { outcome: SUCCESS, sent: false, detail: `[dry-run] comment on ${url}` }
    }
    try {
      await this.reddit().getSubmission(id).reply(draft)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { outcome: FAILED, sent: true, errorClass: classifyError(msg), detail: msg }
    }
    this.commentsSent += 1
    await sleep(jitterMs(30_000, 90_000)) // anti-spam pacing between sends
    return { outcome: SUCCESS, sent: true, detail: `commented on ${url}` }
  }

  private async sendDm(draft: string, target: MissionTarget, dryRun: boolean): Promise<SendResult> {
    if (!redditReady()) {
      return { outcome: FAILED, errorClass: 'config', detail: 'Reddit credentials not configured', sent: false }
    }
    if (this.dmsSent >= MAX_REDDIT_DMS_PER_DAY) {
      return { outcome: SKIP, detail: 'daily reddit-DM cap reached', sent: false }
    }
    const author = stripU(target.author || '')
    if (!author) {
      return { outcome: FAILED, errorClass: 'config', detail: 'no target author for reddit_dm', sent: false }
    }
    if (dryRun) {
      return { outcome: SUCCESS, sent: false, detail: `[dry-run] DM to u/${author}` }
    }
    try {
      await this.reddit().composeMessage({ to: author, subject: 'Quick question', text: draft })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { outcome: FAILED, sent: true, errorClass: classifyError(msg), detail: msg }
    }
    this.dmsSent += 1
    await sleep(jitterMs(60_000, 180_000))
    return { outcome: SUCCESS, sent: true, detail: `DM sent to u/${author}` }
  }
}
