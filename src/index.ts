import { registerAcquisitionTools } from './tools/mantidae'
import { registerCompanionTools } from './tools/companion'

/**
 * SignalPipe — OpenClaw Plugin v1.6.2
 *
 * Registers 17 tools across two subsystems:
 *   Acquisition tools   — top-of-funnel: signal detection → mission review → drafting
 *   Companion tools     — mid/bottom-of-funnel: prospect nurturing → pipeline → messaging
 *
 * v1.6.2 — docstring + presentation refresh (no tool surface change)
 *   - signalpipe_reject_mission and signalpipe_delete_mission descriptions
 *     now explicitly call out the stale/deleted-post case: when a post is
 *     gone before the operator can reply, the architecturally correct tool
 *     is delete_mission (no RL penalty) — reject_mission(not_relevant)
 *     would unfairly demote a station that did nothing wrong.
 *   - Aligns with mantidae backend v3.7.13 + v3.7.14 (cross-poster dedup
 *     at lead-insert, swarm temperature=0.2, MCP docstring fix in
 *     commit 43f9429). No behaviour change in the plugin itself — these
 *     descriptions are the LLM-facing surface that closes the workflow
 *     gap where operators were reaching for reject_mission(not_relevant)
 *     on stale posts and polluting the RL signal.
 *
 * v1.6.1 — docs-only sync with mantidae v3.7.7 per-station RL
 *
 * v1.6.0 — universal signal scoring
 *   - signalpipe_score_signal added: exposes the scout's scoring engine
 *     for arbitrary text from any channel the host agent can read
 *     (Gmail, Slack, Discord, Telegram, LinkedIn, web pages, transcripts).
 *     Returns score, classification, role, sub-scores, competitor info,
 *     and a drafting_context block for client-side reply drafting.
 *     Lives in companion.ts because the use-case is multi-channel and
 *     mid-funnel (assessing inbound replies, hand-pasted leads, etc.).
 *
 * v1.5.0 — response contract + delete_mission
 *   - signalpipe_delete_mission added: silent queue cleanup with no RL signal,
 *     companion to reject_mission (which is the "teach the system" path).
 *   - signalpipe_get_missions defaults to lean payloads now —
 *     include_context is opt-in; the verbose draft_context is no longer
 *     forced on every listing call.
 *   - All read-tool descriptions rewritten as presentation guidance for
 *     the host LLM (no shell introspection, working-payload framing on
 *     drafting tools, full reason taxonomy on reject).
 *
 * v1.4.0 baseline — CLIENT-SIDE DRAFTING. Scoring + signal detection still
 * run on the backend, but message drafts can be generated using the host
 * LLM (OpenClaw / Claude.ai / Cursor / Windsurf). This pushes drafting
 * cost off the SignalPipe backend onto the user's existing LLM subscription:
 *
 *   signalpipe_draft_mission      — fetches lead + product context, returns drafting instructions
 *   signalpipe_upload_draft       — uploads the resulting draft for human review
 *   signalpipe_get_message_prompt — fetches prospect prompt for client-side drafting
 *   signalpipe_record_message     — logs a client-drafted nurture message
 *
 * The backend-LLM endpoint signalpipe_get_message still works — pick whichever fits.
 *
 * ── Required env vars ─────────────────────────────────────────────────────
 *   SIGNALPIPE_API_URL       https://api.signalpipe.io
 *   SIGNALPIPE_OPERATOR_KEY  your-secret-operator-key (from signalpipe.io)
 */
export function register(api: any): void {
  registerAcquisitionTools(api)
  registerCompanionTools(api)

  console.log('[SignalPipe] Plugin v1.6.2 loaded — 17 tools registered')
}

export default register
