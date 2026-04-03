/**
 * SignalPipe Plugin Configuration
 *
 * Set these environment variables before starting OpenClaw gateway.
 *
 * ── Required ──────────────────────────────────────────────────────────────
 * SIGNALPIPE_API_URL       URL of your SignalPipe backend
 * SIGNALPIPE_OPERATOR_KEY  Your secret operator key (from SignalPipe dashboard)
 *
 * ── LLM drafting (BYOK — bring your own key) ──────────────────────────────
 * ANTHROPIC_API_KEY        Claude Haiku — preferred (fast, cheap, accurate)
 * OPENAI_API_KEY           gpt-4o-mini — fallback
 * GEMINI_API_KEY           gemini-2.0-flash — second fallback
 *
 * ── Twitter/X reply outreach (optional) ───────────────────────────────────
 * X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
 *
 * ── Reddit DM outreach (optional) ─────────────────────────────────────────
 * REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *
 * ── Rate limits & behaviour ───────────────────────────────────────────────
 * MAX_TWITTER_ACTIONS_PER_DAY   Default: 10
 * MAX_REDDIT_DMS_PER_DAY        Default: 5
 * AUTO_APPROVE_THRESHOLD        Fused score 0.0–1.0; 0 = all manual (default)
 */

// ── Backend connection ────────────────────────────────────────────────────────
export const API_URL      = process.env.SIGNALPIPE_API_URL      || 'http://localhost:8000'
export const OPERATOR_KEY = process.env.SIGNALPIPE_OPERATOR_KEY || ''

// ── LLM keys (BYOK — sidecar uses client's own key, client pays their own costs)
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
export const OPENAI_API_KEY    = process.env.OPENAI_API_KEY    || ''
export const GEMINI_API_KEY    = process.env.GEMINI_API_KEY    || ''

// ── Twitter/X outreach ────────────────────────────────────────────────────────
export const X_API_KEY      = process.env.X_API_KEY      || ''
export const X_API_SECRET   = process.env.X_API_SECRET   || ''
export const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN || ''
export const X_ACCESS_SECRET = process.env.X_ACCESS_SECRET || ''

// ── Reddit DM outreach ────────────────────────────────────────────────────────
export const REDDIT_CLIENT_ID     = process.env.REDDIT_CLIENT_ID     || ''
export const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || ''
export const REDDIT_USERNAME      = process.env.REDDIT_USERNAME      || ''
export const REDDIT_PASSWORD      = process.env.REDDIT_PASSWORD      || ''

// ── Rate limits & auto-approve ────────────────────────────────────────────────
export const MAX_TWITTER_ACTIONS    = parseInt(process.env.MAX_TWITTER_ACTIONS_PER_DAY || '10', 10)
export const MAX_REDDIT_DMS         = parseInt(process.env.MAX_REDDIT_DMS_PER_DAY      || '5',  10)
export const AUTO_APPROVE_THRESHOLD = parseFloat(process.env.AUTO_APPROVE_THRESHOLD    || '0')

// ── Warnings ──────────────────────────────────────────────────────────────────
if (!OPERATOR_KEY) {
  console.warn('[SignalPipe] SIGNALPIPE_OPERATOR_KEY is not set — all API calls will fail.')
}

export const authHeaders = (): Record<string, string> => ({
  'Authorization': `Bearer ${OPERATOR_KEY}`,
  'Content-Type':  'application/json',
})
