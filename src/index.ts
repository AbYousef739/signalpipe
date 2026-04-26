import { registerMantidaeTools } from './tools/mantidae'
import { registerCompanionTools } from './tools/companion'

/**
 * SignalPipe — OpenClaw Plugin v1.4.0
 *
 * Registers 15 tools across two subsystems:
 *   Mantidae tools      — top-of-funnel: signal detection → mission review → drafting
 *   Companion tools     — mid/bottom-of-funnel: prospect nurturing → pipeline → messaging
 *
 * v1.4.0 adds CLIENT-SIDE DRAFTING. Scoring + signal detection still run on the
 * backend, but message drafts can now be generated using the host LLM
 * (OpenClaw / Claude.ai / Cursor / Windsurf). This pushes drafting cost off
 * the SignalPipe backend onto the user's existing LLM subscription:
 *
 *   signalpipe_draft_mission     — fetches lead + product context, returns drafting instructions
 *   signalpipe_upload_draft      — uploads the resulting draft for human review
 *   signalpipe_get_message_prompt — fetches prospect prompt for client-side drafting
 *   signalpipe_record_message    — logs a client-drafted nurture message
 *
 * The original backend-LLM endpoints (signalpipe_get_message,
 * signalpipe_get_missions) still work — clients can mix and match.
 *
 * ── Required env vars ─────────────────────────────────────────────────────
 *   SIGNALPIPE_API_URL       https://your-backend.up.railway.app
 *   SIGNALPIPE_OPERATOR_KEY  your-secret-operator-key (from signalpipe.io)
 */
export function register(api: any): void {
  registerMantidaeTools(api)
  registerCompanionTools(api)

  console.log('[SignalPipe] Plugin v1.4.0 loaded — 15 tools registered')
}

export default register
