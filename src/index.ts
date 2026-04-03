import { registerMantidaeTools } from './tools/mantidae'
import { registerCompanionTools } from './tools/companion'
import { startSidecar }           from './sidecar/loop'

/**
 * SignalPipe — OpenClaw Plugin v1.1.0
 *
 * Registers 11 tools across two subsystems:
 *   Mantidae tools      — top-of-funnel: signal detection → mission review
 *   Companion tools     — mid/bottom-of-funnel: prospect nurturing → pipeline
 *
 * Also starts a background sidecar loop that:
 *   - Polls the backend every 60 seconds for pending missions
 *   - Drafts replies using your own LLM key (BYOK — you pay your own costs)
 *   - Executes approved outreach via your own Twitter/Reddit credentials
 *
 * ── Required env vars ─────────────────────────────────────────────────────
 *   SIGNALPIPE_API_URL       https://your-backend.up.railway.app
 *   SIGNALPIPE_OPERATOR_KEY  your-secret-operator-key
 *
 * ── LLM drafting (set one) ────────────────────────────────────────────────
 *   ANTHROPIC_API_KEY        Preferred — Claude Haiku
 *   OPENAI_API_KEY           Fallback — gpt-4o-mini
 *   GEMINI_API_KEY           Fallback — gemini-2.0-flash
 *
 * ── Outreach (optional) ───────────────────────────────────────────────────
 *   X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET
 *   REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USERNAME / REDDIT_PASSWORD
 */
export default function register(api: any): void {
  registerMantidaeTools(api)
  registerCompanionTools(api)

  console.log('[SignalPipe] Plugin loaded — 11 tools registered')

  // Start the background sidecar — runs every 60 seconds inside OpenClaw
  startSidecar()
}
