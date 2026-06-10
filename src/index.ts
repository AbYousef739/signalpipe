import { registerAcquisitionTools } from './tools/mantidae'
import { registerCompanionTools } from './tools/companion'
import { registerSenderTools } from './tools/sender'

/**
 * SignalPipe — OpenClaw Plugin v2.0.1
 *
 * Registers 20 tools across three subsystems:
 *   Acquisition tools   — top-of-funnel: signal detection → mission review → drafting
 *   Companion tools     — mid/bottom-of-funnel: prospect nurturing → pipeline → messaging
 *   Sender tools        — the v4 "send" half: stream approved missions and post
 *                         them on Reddit with the operator's OWN credentials
 *
 * v2.0.1 — first published 2.0 build. Internal scoring constants were removed
 *   from the public docs and tool descriptions; the brain's math stays
 *   server-side. No tool surface or behaviour change from v2.0.0.
 *
 * v2.0.0 — the sender lands (SignalPipe v4: "the math runs on us, the sending
 *   runs on you"). The brain scores, drafts, and approves; the plugin can now
 *   ALSO send.
 *   - signalpipe_start_sender / signalpipe_stop_sender / signalpipe_sender_status
 *     run a background loop that holds an SSE stream to /v4/missions/stream,
 *     receives pre-approved missions, posts reddit_comment / reddit_dm with the
 *     operator's own Reddit (snoowrap) credentials, and acks the outcome to
 *     /v4/missions/{id}/ack. twitter_reply missions are left for the standalone
 *     signalpipe-daemon. New OPTIONAL env vars REDDIT_CLIENT_ID/SECRET/USERNAME/
 *     PASSWORD enable the sender; MCP-only operators are unaffected.
 *   - The sender contains ZERO scoring, drafting, or storage. Reddit creds stay
 *     on the operator's machine and are never sent to SignalPipe. Within a
 *     running session each mission is posted at most once (no double-send), even
 *     across reconnects; daily caps skip (not fail) capped missions.
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
  registerSenderTools(api)

  console.log('[SignalPipe] Plugin v2.0.1 loaded — 20 tools registered (acquisition + companion + sender)')
}

export default register
