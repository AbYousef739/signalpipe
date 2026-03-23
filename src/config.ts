/**
 * SignalPipe Plugin Configuration
 * Set these environment variables before starting OpenClaw gateway.
 *
 * SIGNALPIPE_API_URL      — URL of your SignalPipe backend (Railway)
 * SIGNALPIPE_OPERATOR_KEY — The OPERATOR_KEY set on your backend
 */

export const API_URL     = process.env.SIGNALPIPE_API_URL      || 'http://localhost:8000'
export const OPERATOR_KEY = process.env.SIGNALPIPE_OPERATOR_KEY || ''

if (!OPERATOR_KEY) {
  console.warn('[SignalPipe] SIGNALPIPE_OPERATOR_KEY is not set. All API calls will fail.')
}

export const authHeaders = (): Record<string, string> => ({
  'Authorization': `Bearer ${OPERATOR_KEY}`,
  'Content-Type':  'application/json',
})
