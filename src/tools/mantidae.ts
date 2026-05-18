import { Type } from '@sinclair/typebox'
import { api } from '../api/client'

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(e: unknown): ToolResult {
  return { content: [{ type: 'text', text: String(e) }], isError: true }
}

// Tight enums — give the model a closed list so it can't invent values
// that the backend silently treats as 'no_reason' / defaults.
const RejectionReason = Type.Union([
  Type.Literal('not_relevant'),
  Type.Literal('sarcasm'),
  Type.Literal('wrong_product'),
  Type.Literal('spam'),
  Type.Literal('too_vague'),
  Type.Literal('already_customer'),
  Type.Literal('no_reason'),
])

const StationPlatform = Type.Union([
  Type.Literal('rss'),
  Type.Literal('hn'),
  Type.Literal('reddit'),
  Type.Literal('twitter_search'),
])

/**
 * Mantidae acquisition tools.
 * Covers the top-of-funnel: signal detection → mission review → approve/reject.
 */
export function registerAcquisitionTools(openClaw: any): void {

  openClaw.registerTool({
    name: 'signalpipe_get_missions',
    description:
      'List pending lead missions awaiting review. Each mission includes ' +
      'id, signal score, channel, lead snippet, prospect handle, role ' +
      '(closer/advisor/educator), and the drafted reply if any. ' +
      'Presentation: format as a numbered list inline — score, role, ' +
      'handle, snippet, draft per mission. Do NOT run shell commands or ' +
      'write files to inspect this response; the data is already ' +
      'structured. ' +
      'Call this when the user asks to review leads, check the pipeline, ' +
      'or see what needs attention.',
    parameters: Type.Object({
      include_context: Type.Optional(Type.Boolean({
        description:
          'Leave false for listings (default). Set true only when about to draft ' +
          'a reply and you need the full scoring breakdown — but prefer ' +
          'signalpipe_draft_mission(mission_id) which scopes the context to one mission.',
      })),
    }),
    async execute(_id: string, params: { include_context?: boolean } = {}) {
      try {
        const path = params.include_context
          ? '/sync/missions?include=draft_context'
          : '/sync/missions'
        return ok(await api.get(path))
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_draft_mission',
    description:
      'Get the drafting payload for a single mission so you can write the ' +
      'reply CLIENT-SIDE using your own LLM reasoning. This is a working ' +
      'payload, not a display payload — it contains product positioning, ' +
      'lead text, scoring breakdown, and the response schema your draft ' +
      'must follow. Use it to write the draft; do NOT dump the full ' +
      'payload back to the user. ' +
      'Workflow: 1) call this with mission_id, 2) compose a reply that ' +
      'fits the role/tone in context.strategy, 3) call ' +
      'signalpipe_upload_draft. If the lead is clearly not a buying ' +
      'signal, skip drafting and call signalpipe_reject_mission instead.',
    parameters: Type.Object({
      mission_id: Type.String({ description: 'Mission ID to draft for (must be in draft_needed state)' }),
    }),
    async execute(_id: string, params: { mission_id: string }) {
      try {
        const res = (await api.get('/sync/missions?include=draft_context')) as {
          missions?: Array<{ id: string; status: string; draft_context?: Record<string, unknown> }>
        }
        const mission = (res?.missions || []).find((m) => m.id === params.mission_id)
        if (!mission) return err('Mission not found in the current queue.')
        const ctx = mission.draft_context as
          | { product: { name?: string; value_prop?: string; target_audience?: string; anchors?: string[] };
              lead:    { title?: string; snippet?: string; url?: string; author_handle?: string; platform?: string;
                         competitor?: { name?: string; intent?: string } | null };
              response_schema: Record<string, string> }
          | undefined
        if (!ctx) {
          return err(`Mission ${params.mission_id} has no draft_context — already drafted, approved, or rejected.`)
        }

        const anchorList = (ctx.product.anchors || []).map((a) => `    - "${a}"`).join('\n') || '    (none)'
        const competitor = ctx.lead.competitor
          ? `  competitor mention: ${ctx.lead.competitor.name} (intent: ${ctx.lead.competitor.intent || 'neutral'})\n`
          : ''

        const instructions =
          `Evaluate this buying-signal lead and write one reply draft.\n\n` +
          `PRODUCT\n` +
          `  name:            ${ctx.product.name || '(unnamed)'}\n` +
          `  value_prop:      ${ctx.product.value_prop || '(none)'}\n` +
          `  target_audience: ${ctx.product.target_audience || '(none)'}\n` +
          `  buyer anchors:\n${anchorList}\n\n` +
          `LEAD (platform: ${ctx.lead.platform || 'unknown'})\n` +
          `  title:  ${ctx.lead.title || '(none)'}\n` +
          `  author: ${ctx.lead.author_handle || '(unknown)'}\n` +
          `  url:    ${ctx.lead.url || ''}\n` +
          `  body:   ${ctx.lead.snippet || ''}\n` +
          competitor +
          `\nTASK\n` +
          `  1. Think briefly from three angles: skeptical (is this real?), analytical ` +
          `(where does the product fit the stated need?), optimistic (what is the most ` +
          `helpful natural opening?).\n` +
          `  2. If it is NOT a genuine buying signal (sarcasm, off-topic, unrelated), ` +
          `call signalpipe_reject_mission with a rejection_reason and stop.\n` +
          `  3. Otherwise produce ONE final reply draft that:\n` +
          `     - is under 280 characters\n` +
          `     - opens with genuine help, not a pitch\n` +
          `     - never starts with 'I' or the product name\n` +
          `     - avoids exclamation marks\n` +
          `     - mentions the product only if it naturally fits the lead's need\n` +
          `  4. Call signalpipe_upload_draft with:\n` +
          `       mission_id = "${params.mission_id}"\n` +
          `       draft      = "<your final draft>"\n` +
          `       reasoning  = "<one sentence — why this lead is a fit>"`
        return ok({
          mission_id: params.mission_id,
          draft_instructions: instructions,
          context: ctx,
        })
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_upload_draft',
    description:
      'Upload a client-generated reply draft to a mission. Use after signalpipe_draft_mission. ' +
      'The mission transitions to pending_approval state and will appear for human review. ' +
      'Optionally include a disagreement score [0..1] if you ran multi-persona evaluation.',
    parameters: Type.Object({
      mission_id:   Type.String({ description: 'Mission ID from signalpipe_draft_mission' }),
      draft:        Type.String({ description: 'Final reply draft (under 280 chars)' }),
      reasoning:    Type.Optional(Type.String({ description: 'One-sentence justification (for audit log)' })),
      disagreement: Type.Optional(Type.Number({ description: 'Max-min across persona scores, 0..1' })),
    }),
    async execute(_id: string, params: { mission_id: string; draft: string; reasoning?: string; disagreement?: number }) {
      try {
        const body: Record<string, unknown> = { id: params.mission_id, content: params.draft }
        if (typeof params.disagreement === 'number') body.disagreement = params.disagreement
        if (params.reasoning) body.reasoning = params.reasoning
        await api.post('/actions/upload_draft', body)
        return ok({ status: 'uploaded', mission_id: params.mission_id })
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_approve_mission',
    description:
      'Approve a lead mission and queue it for outreach. ' +
      'If the user edited the draft, pass the new version via the draft parameter — ' +
      'otherwise the existing AI draft is used unchanged. ' +
      'Always confirm the mission ID and draft wording with the user before calling this.',
    parameters: Type.Object({
      mission_id: Type.String({ description: 'The mission ID to approve (from signalpipe_get_missions)' }),
      draft: Type.Optional(Type.String({ description: 'Edited draft content. Omit to use the existing AI draft.' })),
    }),
    async execute(_id: string, params: { mission_id: string; draft?: string }) {
      try {
        await api.post('/actions/approve', { id: params.mission_id, draft: params.draft || null })
        await api.post('/feedback/record', { mission_id: params.mission_id, outcome: 'replied' })
        return ok({ status: 'approved', mission_id: params.mission_id })
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_reject_mission',
    description:
      'Reject a lead mission — it was not a real buying signal. Use this ' +
      'when you want the system to LEARN from the rejection. Each reason ' +
      'maps to a different RL penalty applied to the source feed weight, ' +
      'so the swarm sharpens over time. ' +
      'When to use this vs signalpipe_delete_mission: ' +
      'reject = the lead was a bad signal — feed it back so scoring ' +
      'adjusts (always prefer this when you have any opinion on why). ' +
      'delete = queue cleanup only, no learning. ' +
      'Reasons: spam (heaviest penalty, bot/promoted), not_relevant ' +
      '(wrong audience), wrong_product (signal real but wrong product ' +
      'matched), too_vague (signal too weak), sarcasm (ironic, not feed ' +
      'fault), already_customer (no penalty — they bought), no_reason ' +
      '(default). Pick the most accurate reason — accuracy directly ' +
      'improves how the system learns.',
    parameters: Type.Object({
      mission_id: Type.String({ description: 'The mission ID to reject' }),
      rejection_reason: Type.Optional(RejectionReason),
    }),
    async execute(_id: string, params: { mission_id: string; rejection_reason?: string }) {
      try {
        await api.post('/actions/reject', { id: params.mission_id, rejection_reason: params.rejection_reason || 'no_reason' })
        return ok({ status: 'rejected', mission_id: params.mission_id })
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_delete_mission',
    description:
      'Hard-delete a mission row — silent cleanup only, no learning ' +
      'signal. Use only when you want to clear the row without teaching ' +
      'the system anything: duplicates, accidental scrapes, leads the ' +
      'user does not want surfaced again but has no opinion on. ' +
      'When to use this vs signalpipe_reject_mission: ' +
      'delete = queue cleanup, no learning, scoring untouched. ' +
      'reject = the lead was a bad signal and you want the system to ' +
      'learn from it. Always prefer reject when you can categorise WHY ' +
      'the lead was wrong — the RL loop only sharpens when you give it ' +
      'a reason.',
    parameters: Type.Object({
      mission_id: Type.String({ description: 'The mission ID to delete' }),
    }),
    async execute(_id: string, params: { mission_id: string }) {
      try {
        await api.delete(`/actions/mission/${encodeURIComponent(params.mission_id)}`)
        return ok({ status: 'deleted', mission_id: params.mission_id })
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_scout_now',
    description:
      'Trigger an immediate scouting run across all active products and RSS stations. ' +
      'Normally runs automatically every 10 minutes. Call this for an on-demand scan.',
    parameters: Type.Object({}),
    async execute(_id: string) {
      try { return ok(await api.post('/scout/launch_batch')) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_get_products',
    description:
      'List all active products configured in SignalPipe, with their anchor sentences, competitor keywords, and creation dates. (Note: products.rl_weight is returned for backward compatibility but is no longer used as a scoring multiplier as of v3.7.7 — per-station RL weights live on stations.rl_weight instead.)',
    parameters: Type.Object({}),
    async execute(_id: string) {
      try { return ok(await api.get('/products/list')) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_add_product',
    description:
      'Register a new product for lead monitoring. ' +
      'Anchor sentences are the most important field — write them as a buyer speaking: ' +
      '"I need X", "looking for Y", "alternative to Z". ' +
      'After adding, call signalpipe_reload_products to activate immediately.',
    parameters: Type.Object({
      name:                Type.String({ description: 'Product name' }),
      description:         Type.Optional(Type.String({ description: 'One-sentence product description' })),
      target_audience:     Type.Optional(Type.String({ description: 'Who buys this product' })),
      value_prop:          Type.Optional(Type.String({ description: 'Why buyers choose this over alternatives' })),
      anchor_sentences:    Type.Array(Type.String(), { description: '5–10 buying-intent phrases written as the buyer' }),
      competitor_keywords: Type.Optional(Type.Array(Type.String(), { description: 'Competitor names to watch for' })),
      buy_signal_keywords: Type.Optional(Type.Array(Type.String(), { description: 'Pre-filter keywords — any must appear for a post to be scored' })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      try { return ok(await api.post('/products/add', params)) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_add_station',
    description:
      'Add a new RSS feed or search source for a product to monitor. ' +
      'Reddit: https://www.reddit.com/r/SUBREDDIT/.rss — HN: https://hnrss.org/newest?q=KEYWORDS',
    parameters: Type.Object({
      product_id: Type.String({ description: 'Product ID to attach this station to' }),
      name:       Type.String({ description: 'Friendly name for this station' }),
      platform:   StationPlatform,
      rss_url:    Type.Optional(Type.String({ description: 'Full RSS feed URL' })),
      keyword:    Type.Optional(Type.String({ description: 'Primary keyword context for this feed' })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      try { return ok(await api.post('/stations/add', params)) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_reload_products',
    description:
      'Hot-reload the product cache on the backend after adding or editing products. No server restart needed.',
    parameters: Type.Object({}),
    async execute(_id: string) {
      try { return ok(await api.post('/products/reload')) } catch (e) { return err(e) }
    },
  })
}
