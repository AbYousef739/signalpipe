/**
 * SignalPipe Plugin Configuration
 *
 * Set these environment variables before starting your OpenClaw gateway.
 *
 * ── Required ──────────────────────────────────────────────────────────────
 * SIGNALPIPE_API_URL       URL of your SignalPipe backend
 * SIGNALPIPE_OPERATOR_KEY  Your secret operator key (from signalpipe.io dashboard)
 *
 * ── Optional: in-plugin Reddit sender (v2.0) ───────────────────────────────
 * REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USERNAME / REDDIT_PASSWORD
 *   A Reddit "script" app on the SENDING account. Only needed to run the
 *   in-plugin sender (signalpipe_start_sender). These stay on this machine
 *   and are NEVER sent to SignalPipe — the brain only ever scores and drafts.
 * MAX_REDDIT_COMMENTS_PER_DAY (default 15) / MAX_REDDIT_DMS_PER_DAY (default 5)
 */

// ── Backend connection ────────────────────────────────────────────────────────
export const API_URL      = process.env.SIGNALPIPE_API_URL      || 'http://localhost:8000'
export const OPERATOR_KEY = process.env.SIGNALPIPE_OPERATOR_KEY || ''

// ── Startup validation ────────────────────────────────────────────────────────
if (!process.env.SIGNALPIPE_API_URL) {
  throw new Error('[SignalPipe] SIGNALPIPE_API_URL is required. Set it before starting OpenClaw.')
}
if (!OPERATOR_KEY) {
  throw new Error('[SignalPipe] SIGNALPIPE_OPERATOR_KEY is required. Set it before starting OpenClaw.')
}

export const authHeaders = (): Record<string, string> => ({
  'Authorization': `Bearer ${OPERATOR_KEY}`,
  'Content-Type':  'application/json',
})

// ── Reddit sender credentials (optional — only for the in-plugin sender) ────────
// Deliberately NO startup validation here: the plugin must keep working for
// MCP-only operators who never run the sender. redditReady() gates the sender.
export const REDDIT = {
  clientId:     process.env.REDDIT_CLIENT_ID     || '',
  clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
  username:     process.env.REDDIT_USERNAME      || '',
  password:     process.env.REDDIT_PASSWORD      || '',
  userAgent:    process.env.REDDIT_USER_AGENT    || 'signalpipe-plugin/2.0',
}

export const redditReady = (): boolean =>
  Boolean(REDDIT.clientId && REDDIT.clientSecret && REDDIT.username && REDDIT.password)

// ── Daily send caps (anti-spam pacing; reset at local midnight) ─────────────────
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export const MAX_REDDIT_COMMENTS_PER_DAY = intEnv('MAX_REDDIT_COMMENTS_PER_DAY', 15)
export const MAX_REDDIT_DMS_PER_DAY      = intEnv('MAX_REDDIT_DMS_PER_DAY', 5)
