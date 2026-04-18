import { Type } from '@sinclair/typebox'
import { api } from '../api/client'

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(e: unknown): ToolResult {
  return { content: [{ type: 'text', text: String(e) }], isError: true }
}

/**
 * Mantidae acquisition tools.
 * Covers the top-of-funnel: signal detection → mission review → approve/reject.
 */
export function registerMantidaeTools(openClaw: any): void {

  openClaw.registerTool({
    name: 'signalpipe_get_missions',
    description:
      'Fetch all pending lead missions awaiting human review. ' +
      'Returns missions with signal scores, product names, AI-drafted replies, ' +
      'competitor flags, outreach channels, and lead snippets. ' +
      'Call this when the user asks to review leads, check the pipeline, or see what needs attention.',
    parameters: Type.Object({}),
    async execute(_id: string) {
      try { return ok(await api.get('/sync/missions')) } catch (e) { return err(e) }
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
      'Reject a lead mission — it was not a real buying signal. ' +
      'Updates status to rejected and nudges the RL weight down for that product.',
    parameters: Type.Object({
      mission_id: Type.String({ description: 'The mission ID to reject' }),
      rejection_reason: Type.Optional(Type.String({
        description: 'Why this lead was rejected: not_relevant | sarcasm | wrong_product | spam | too_vague | already_customer | no_reason',
      })),
    }),
    async execute(_id: string, params: { mission_id: string; rejection_reason?: string }) {
      try {
        await api.post('/actions/reject', { id: params.mission_id, rejection_reason: params.rejection_reason || 'no_reason' })
        return ok({ status: 'rejected', mission_id: params.mission_id })
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
      'List all active products configured in SignalPipe, including RL weights and creation dates.',
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
      platform:   Type.String({ description: 'Source type: rss | hn | reddit | twitter_search' }),
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
