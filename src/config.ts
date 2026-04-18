/**
 * SignalPipe Plugin Configuration
 *
 * Set these environment variables before starting your OpenClaw gateway.
 *
 * ── Required ──────────────────────────────────────────────────────────────
 * SIGNALPIPE_API_URL       URL of your SignalPipe backend
 * SIGNALPIPE_OPERATOR_KEY  Your secret operator key (from signalpipe.io dashboard)
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
