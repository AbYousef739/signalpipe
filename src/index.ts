import { registerMantidaeTools } from './tools/mantidae'
import { registerCompanionTools } from './tools/companion'

/**
 * SignalPipe — OpenClaw Plugin v1.3.0
 *
 * Registers 11 tools across two subsystems:
 *   Mantidae tools      — top-of-funnel: signal detection → mission review
 *   Companion tools     — mid/bottom-of-funnel: prospect nurturing → pipeline
 *
 * All scoring, drafting, and outreach execution runs on the SignalPipe
 * backend — nothing runs client-side. Install the plugin, set your keys,
 * and your agent has a full sales pipeline.
 *
 * ── Required env vars ─────────────────────────────────────────────────────
 *   SIGNALPIPE_API_URL       https://your-backend.up.railway.app
 *   SIGNALPIPE_OPERATOR_KEY  your-secret-operator-key (from signalpipe.io)
 */
export function register(api: any): void {
  registerMantidaeTools(api)
  registerCompanionTools(api)

  console.log('[SignalPipe] Plugin loaded — 11 tools registered')
}

export default register
