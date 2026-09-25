import { Type } from '@sinclair/typebox'
import { api, PANEL_TIMEOUT_MS } from '../api/client'

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
      'DO NOT use reject_mission when the post is gone (deleted by the ' +
      'poster, 404, removed by mods, or stale beyond your reply window) — ' +
      'the lead was not bad, the opportunity just evaporated. Use ' +
      'signalpipe_delete_mission instead, which leaves the source ' +
      'station\'s RL weight untouched. Reaching for ' +
      'reject_mission(not_relevant) on a deleted post applies an unwarranted ' +
      'penalty to a station that did nothing wrong. ' +
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
      'CANONICAL CASE: the post is gone by the time the user gets there — ' +
      'deleted by the poster, 404, removed by mods, or stale beyond the ' +
      'reply window. The lead was not wrong, the opportunity just ' +
      'evaporated. delete_mission is the right tool because there is ' +
      'nothing to learn from the station — its RL weight stays untouched. ' +
      'Using reject_mission here would unfairly penalise a station for an ' +
      'event it did not cause. ' +
      'When to use this vs signalpipe_reject_mission: ' +
      'delete = queue cleanup, no learning, scoring untouched. Canonical ' +
      'uses: post deleted, duplicates, accidental scrapes. ' +
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
    name: 'signalpipe_mark_sent',
    description:
      'Mark a mission as sent by hand: "I already replied to this person myself." Use this the ' +
      'moment the user has posted the reply or sent the message through the platform, instead of ' +
      'letting the sender do it (most first touches are manual public replies). It marks the ' +
      'mission sent, records the outreach so follow-up drafts know what was already said ' +
      '(creating the prospect), and counts as a positive signal for the source feed. ' +
      'vs signalpipe_approve_mission: approve queues it for the sender to deliver; mark_sent ' +
      'records that YOU already delivered it.',
    parameters: Type.Object({
      mission_id: Type.String({ description: 'The mission ID you sent by hand' }),
    }),
    async execute(_id: string, params: { mission_id: string }) {
      try { return ok(await api.post('/actions/mark_sent', { id: params.mission_id })) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_scout_now',
    description:
      'Trigger an immediate scouting run across your active products and RSS stations. ' +
      'Runs automatically every 30 minutes; on-demand scans are limited to one per 15 minutes ' +
      '(a "skipped" status with reason cooldown or batch_in_progress is normal).',
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
    name: 'signalpipe_suggest_anchors',
    description:
      'Generate candidate anchor sentences for a product. Call this BEFORE signalpipe_add_product. ' +
      'Anchors decide what every incoming post is compared against, and most people write ' +
      'marketing copy by mistake. Flow: ask the user what the product is, who buys it and what it ' +
      'does for them; call this; SHOW the anchors and invite edits (they know their buyers\' words); ' +
      'then call signalpipe_add_product with the approved list. A good anchor is the BUYER ' +
      'describing their PROBLEM ("our support inbox is a mess and emails get missed"), never the ' +
      'seller describing the product.',
    parameters: Type.Object({
      name:            Type.String({ description: 'Product name' }),
      value_prop:      Type.String({ description: 'What it does for the buyer' }),
      target_audience: Type.Optional(Type.String({ description: 'Who buys it' })),
      description:     Type.Optional(Type.String({ description: 'One-sentence product description' })),
      count:           Type.Optional(Type.Integer({ minimum: 3, maximum: 15, description: 'How many anchors (default 8)' })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      try {
        return ok(await api.post('/products/suggest_anchors', params, { timeoutMs: PANEL_TIMEOUT_MS }))
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_add_product',
    description:
      'Register a new product for lead monitoring. Call signalpipe_suggest_anchors first and get ' +
      'the user\'s approval on the anchors. Anchor sentences are the most important field — write ' +
      'them as a buyer speaking: "I need X", "looking for Y", "alternative to Z". ' +
      'Leave buy_signal_keywords EMPTY unless the user has a specific reason: it is an AND-gate, ' +
      'and a post matching none of the keywords is dropped before anything reads it, so a keyword ' +
      'list silently deletes buyers who phrase things differently. ' +
      'competitor_keywords: direct substitutes only. ' +
      'After adding, call signalpipe_reload_products to activate immediately.',
    parameters: Type.Object({
      name:                Type.String({ description: 'Product name' }),
      description:         Type.Optional(Type.String({ description: 'One-sentence product description' })),
      target_audience:     Type.Optional(Type.String({ description: 'Who buys this product' })),
      value_prop:          Type.Optional(Type.String({ description: 'Why buyers choose this over alternatives' })),
      anchor_sentences:    Type.Array(Type.String(), { description: '5–10 buying-intent phrases written as the buyer (3 minimum, 5-40 words each)' }),
      competitor_keywords: Type.Optional(Type.Array(Type.String(), { description: 'Direct substitutes a buyer would pick instead' })),
      buy_signal_keywords: Type.Optional(Type.Array(Type.String(), { description: 'Leave empty unless there is a specific reason (see description)' })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      try { return ok(await api.post('/products/add', params)) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_update_product',
    description:
      'Edit a product, or pause and resume it. Only the fields you pass change. anchor_sentences ' +
      'follow the add_product rules, and the previous set is kept so a bad edit can be undone. ' +
      'active=false pauses the product: its stations stop being read and score_signal stops ' +
      'accepting it until active=true. Products are paused, never deleted, so history stays. ' +
      'Confirm with the user before changing anchors or pausing.',
    parameters: Type.Object({
      product_id:          Type.String({ description: 'Product ID (from signalpipe_get_products)' }),
      name:                Type.Optional(Type.String()),
      description:         Type.Optional(Type.String()),
      value_prop:          Type.Optional(Type.String()),
      target_audience:     Type.Optional(Type.String()),
      anchor_sentences:    Type.Optional(Type.Array(Type.String())),
      buy_signal_keywords: Type.Optional(Type.Array(Type.String())),
      competitor_keywords: Type.Optional(Type.Array(Type.String())),
      active:              Type.Optional(Type.Boolean({ description: 'false pauses the product, true resumes it' })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      try { return ok(await api.post('/products/update', params, { timeoutMs: PANEL_TIMEOUT_MS })) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_add_station',
    description:
      'Add a feed for a product to monitor. Station CHOICE decides results more than any setting. ' +
      'Before adding one, run signalpipe_preview_station on it: it says whether real buyers post ' +
      'there. URL patterns — Reddit: https://www.reddit.com/r/SUBREDDIT/new/.rss (use /new/: the ' +
      'bare /.rss is the HOT listing of popular, already-answered posts). HN: ' +
      'https://hnrss.org/newest?q=KEYWORDS. Prefer broad communities where buyers describe ' +
      'PROBLEMS over narrow keyword searches, and go where the buyer complains, not where the ' +
      'industry talks shop. 3-5 good feeds beat 20. twitter_search only routes outreach to X; it ' +
      'reads no feed. The URL must be http(s) on a public host. Returns the new station id.',
    parameters: Type.Object({
      product_id: Type.String({ description: 'Product ID to attach this station to' }),
      name:       Type.String({ description: 'Friendly name for this station' }),
      platform:   StationPlatform,
      rss_url:    Type.Optional(Type.String({ description: 'Full RSS or Atom feed URL (required except for twitter_search)' })),
      keyword:    Type.Optional(Type.String({ description: 'Primary keyword context for this feed' })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      try { return ok(await api.post('/stations/add', params)) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_list_stations',
    description:
      'List your stations (feeds) with a health readout for the last two weeks: posts captured, ' +
      'how many reached your queue, empty or rate-limited fetches, whether SignalPipe or this ' +
      'machine reads it (read_by), and a plain-language verdict such as "Posts are arriving but ' +
      'none matched your product: change the anchor sentences". ' +
      'Presentation: one line per station with name, active or paused, and the verdict. Use the ' +
      'ids with signalpipe_update_station / signalpipe_remove_station.',
    parameters: Type.Object({
      product_id: Type.Optional(Type.String({ description: 'Limit to one product' })),
    }),
    async execute(_id: string, params: { product_id?: string } = {}) {
      try {
        const q = params.product_id ? `?product_id=${encodeURIComponent(params.product_id)}` : ''
        return ok(await api.get(`/stations/list${q}`))
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_update_station',
    description:
      'Pause, resume, rename or re-point a station. Only the fields you pass change. A new rss_url ' +
      'is checked (http or https, a public host) before it is saved.',
    parameters: Type.Object({
      station_id: Type.String({ description: 'Station ID (from signalpipe_list_stations)' }),
      active:     Type.Optional(Type.Boolean({ description: 'false pauses the station, true resumes it' })),
      name:       Type.Optional(Type.String()),
      rss_url:    Type.Optional(Type.String()),
      keyword:    Type.Optional(Type.String()),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      try { return ok(await api.post('/stations/update', params)) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_remove_station',
    description:
      'Remove a station. Confirm with the user first. A station that never produced a lead is ' +
      'deleted; one that already produced leads is switched off instead to keep that history, and ' +
      'the reply says which ("deleted", or "paused" with reason "has_history").',
    parameters: Type.Object({
      station_id: Type.String({ description: 'Station ID (from signalpipe_list_stations)' }),
    }),
    async execute(_id: string, params: { station_id: string }) {
      try { return ok(await api.post('/stations/remove', { station_id: params.station_id })) } catch (e) { return err(e) }
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
