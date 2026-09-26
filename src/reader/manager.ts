/**
 * Client-side reading: read your feeds on this machine, let the brain judge them.
 *
 * The brain marks some of your stations `read_by: "client"`. Those feeds are
 * never fetched by SignalPipe's servers; this reader fetches them from your
 * machine, the same way the scout would (at most 50 posts per feed, a minute
 * between feeds), and hands each page to POST /scout/ingest. The brain scores
 * the posts exactly as if its own scout had read them: same dedup, gates,
 * judges and missions, which reach your queue and the send stream as usual.
 */
import { api } from '../api/client'
import { parseFeed, FeedEntry } from './feed'

// Reddit limits how fast one machine may read its feeds. Five seconds apart,
// every feed after the first came back HTTP 429 (2026-09-26), so five of six
// stations were never read; a minute apart, every fetch came back.
export const FEED_DELAY_MS = 60_000
export const RATE_LIMIT_RETRY_MS = 120_000   // wait after an HTTP 429 before the one retry
const FETCH_TIMEOUT_MS = 20_000
const MAX_ENTRIES = 50
const MIN_EVERY_MINUTES = 10
export const USER_AGENT = 'signalpipe-openclaw (+https://github.com/AbYousef739/signalpipe)'

export interface Station { id: string; name?: string; rss_url?: string; read_by?: string; active?: boolean }
export interface ReadCounts {
  stations: number; sent: number; entries: number; empty: number; skipped: number; rate_limited: number; errors: number
}

/** A feed that answered with an HTTP error; `status` says which. */
export class FeedHttpError extends Error {
  constructor(public status: number) { super(`the feed answered HTTP ${status}`) }
}

const isThrottled = (e: unknown): boolean => (e as { status?: number } | null)?.status === 429

export interface ReaderDeps {
  listStations: () => Promise<Station[]>
  ingest: (stationId: string, entries: FeedEntry[]) => Promise<any>
  fetchText: (url: string) => Promise<string>
  sleep: (ms: number) => Promise<void>
  log: (msg: string) => void
}

export async function fetchFeedText(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal })
    if (!res.ok) throw new FeedHttpError(res.status)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

export const defaultDeps: ReaderDeps = {
  listStations: async () => ((await api.get('/stations/list')) as any)?.stations ?? [],
  ingest: (stationId, entries) => api.post('/scout/ingest', { station_id: stationId, entries }),
  fetchText: fetchFeedText,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (msg) => console.log(`[SignalPipe reader] ${msg}`),
}

/** The stations the brain marks for this machine to read. */
export function clientStations(stations: Station[]): Station[] {
  return stations.filter((s) => s.read_by === 'client' && s.active !== false && !!s.rss_url)
}

/** Read every client-side station once. */
export async function readOnce(deps: ReaderDeps = defaultDeps): Promise<ReadCounts> {
  const stations = clientStations(await deps.listStations())
  const counts: ReadCounts = { stations: stations.length, sent: 0, entries: 0, empty: 0, skipped: 0, rate_limited: 0, errors: 0 }
  if (!stations.length) {
    deps.log('no stations are marked for this machine (read_by=client); nothing to do')
    return counts
  }
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i]
    const name = station.name || station.id
    if (i > 0) await deps.sleep(FEED_DELAY_MS)
    try {
      const url = station.rss_url as string
      let text: string
      try {
        text = await deps.fetchText(url)
      } catch (e) {
        if (!isThrottled(e)) throw e
        deps.log(`${name}: Reddit is limiting requests from this machine (HTTP 429); trying again in ${RATE_LIMIT_RETRY_MS / 1000}s`)
        await deps.sleep(RATE_LIMIT_RETRY_MS)
        try {
          text = await deps.fetchText(url)
        } catch (e2) {
          if (!isThrottled(e2)) throw e2
          counts.rate_limited++
          deps.log(`${name}: still limited; it will be read on the next pass`)
          continue
        }
      }
      const entries = parseFeed(text, MAX_ENTRIES)
      if (!entries.length) {
        counts.empty++
        deps.log(`${name}: the feed returned no posts`)
        continue
      }
      const result = await deps.ingest(station.id, entries)
      if (result?.status === 'accepted') {
        counts.sent++
        counts.entries += Number(result.entries) || 0
        deps.log(`${name}: ${result.entries} posts sent for judging`)
      } else {
        counts.skipped++
        const after = result?.retry_after_s ? `, retry in ${result.retry_after_s}s` : ''
        deps.log(`${name}: skipped (${result?.reason ?? result?.status ?? 'unknown'}${after})`)
      }
    } catch (e) {
      counts.errors++
      deps.log(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return counts
}

class ReaderManager {
  private timer: ReturnType<typeof setTimeout> | null = null
  private everyMinutes = 0
  private passes = 0
  private lastRunAt: string | null = null
  private lastCounts: ReadCounts | null = null
  private lastError: string | null = null
  private passStartedAt: string | null = null
  private busy = false

  constructor(private deps: ReaderDeps = defaultDeps) {}

  /** One pass now. Concurrent calls share nothing: a pass in progress is reported, not doubled. */
  async readOnce(): Promise<ReadCounts | { status: 'busy' }> {
    if (this.busy) return { status: 'busy' }
    this.busy = true
    this.passStartedAt = new Date().toISOString()
    try {
      const counts = await readOnce(this.deps)
      this.passes++
      this.lastRunAt = new Date().toISOString()
      this.lastCounts = counts
      this.lastError = null
      return counts
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      this.busy = false
    }
  }

  /**
   * Start one pass in the background and return at once. A pass takes about a
   * minute per feed (Reddit limits how fast one machine may read), which is
   * longer than a tool call should wait; the counts land in status().
   */
  startPass() {
    if (this.busy) return { status: 'busy' as const }
    void this.readOnce().catch(() => { /* recorded in lastError */ })
    return { status: 'started' as const, note: 'reading in the background, about a minute per feed; call again for the counts' }
  }

  start(everyMinutes: number) {
    const every = Math.max(MIN_EVERY_MINUTES, Math.floor(everyMinutes))
    this.stop()
    this.everyMinutes = every
    const tick = async () => {
      try { await this.readOnce() } catch { /* recorded in lastError; retry next tick */ }
      if (this.everyMinutes) this.timer = setTimeout(tick, every * 60_000)
    }
    void tick()
    return { status: 'reading', every_minutes: every }
  }

  stop() {
    const wasRunning = this.timer !== null || this.everyMinutes > 0
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.everyMinutes = 0
    return { status: wasRunning ? 'stopped' : 'not_running' }
  }

  status() {
    return {
      running: this.everyMinutes > 0,
      reading_now: this.busy,
      pass_started_at: this.busy ? this.passStartedAt : null,
      every_minutes: this.everyMinutes || null,
      passes: this.passes,
      last_run_at: this.lastRunAt,
      last_counts: this.lastCounts,
      last_error: this.lastError,
    }
  }
}

export const readerManager = new ReaderManager()
export { ReaderManager }
