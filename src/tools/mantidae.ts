import { api } from '../api/client'

/**
 * Mantidae acquisition tools.
 * Covers the top-of-funnel: signal detection → mission review → approve/reject.
 */
export function registerMantidaeTools(openClaw: any): void {

  // ------------------------------------------------------------------
  // GET MISSIONS
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_get_missions',
    description:
      'Fetch all pending lead missions awaiting human review. ' +
      'Returns missions with signal scores, product names, AI-drafted replies, ' +
      'competitor flags, outreach channels, and lead snippets. ' +
      'Call this when the user asks to review leads, check the pipeline, or see what needs attention.',
    parameters: {},
    execute: async () => api.get('/sync/missions'),
  })

  // ------------------------------------------------------------------
  // APPROVE MISSION
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_approve_mission',
    description:
      'Approve a lead mission and queue it for outreach. ' +
      'If the user edited the draft, pass the new version via the draft parameter — ' +
      'otherwise the existing AI draft is used unchanged. ' +
      'Always confirm the mission ID and draft wording with the user before calling this.',
    parameters: {
      mission_id: {
        type: 'string',
        description: 'The mission ID to approve (from signalpipe_get_missions)',
      },
      draft: {
        type: 'string',
        description: 'Edited draft content. Omit to use the existing AI draft.',
        optional: true,
      },
    },
    execute: async ({ mission_id, draft }: { mission_id: string; draft?: string }) => {
      await api.post('/actions/approve', { id: mission_id, draft: draft || null })
      await api.post('/feedback/record', { mission_id, outcome: 'replied' })
      return { status: 'approved', mission_id }
    },
  })

  // ------------------------------------------------------------------
  // REJECT MISSION
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_reject_mission',
    description:
      'Reject a lead mission — it was not a real buying signal. ' +
      'This nudges the RL weight down for that product so similar leads ' +
      'score lower in future scouting runs.',
    parameters: {
      mission_id: {
        type: 'string',
        description: 'The mission ID to reject',
      },
    },
    execute: async ({ mission_id }: { mission_id: string }) => {
      await api.post('/feedback/record', { mission_id, outcome: 'ignored' })
      return { status: 'rejected', mission_id }
    },
  })

  // ------------------------------------------------------------------
  // SCOUT NOW
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_scout_now',
    description:
      'Trigger an immediate scouting run across all active products and RSS stations. ' +
      'Normally this runs automatically every 10 minutes via cron. ' +
      'Call this when the user wants fresh leads right now.',
    parameters: {},
    execute: async () => api.post('/scout/launch_batch'),
  })

  // ------------------------------------------------------------------
  // LIST PRODUCTS
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_get_products',
    description:
      'List all active products configured in SignalPipe, ' +
      'including their RL weights and creation dates. ' +
      'Use this to show the user what products are being monitored.',
    parameters: {},
    execute: async () => api.get('/products/list'),
  })

  // ------------------------------------------------------------------
  // ADD PRODUCT
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_add_product',
    description:
      'Register a new product for lead monitoring. ' +
      'Anchor sentences are the most important field — write them as a buyer speaking: ' +
      '"I need X", "looking for Y", "alternative to Z". ' +
      'After adding, call signalpipe_reload_products to activate immediately.',
    parameters: {
      name:                { type: 'string', description: 'Product name' },
      description:         { type: 'string', description: 'One-sentence product description' },
      target_audience:     { type: 'string', description: 'Who buys this product' },
      value_prop:          { type: 'string', description: 'Why buyers choose this over alternatives' },
      anchor_sentences:    { type: 'array',  items: { type: 'string' }, description: '5–10 buying-intent phrases written as the buyer' },
      competitor_keywords: { type: 'array',  items: { type: 'string' }, description: 'Competitor names/products to watch for' },
      buy_signal_keywords: { type: 'array',  items: { type: 'string' }, description: 'Cheap pre-filter keywords — any of these must appear for a post to be scored' },
    },
    execute: async (params: Record<string, unknown>) =>
      api.post('/products/add', params),
  })

  // ------------------------------------------------------------------
  // ADD STATION
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_add_station',
    description:
      'Add a new RSS feed or search source for a product to monitor. ' +
      'Reddit feeds follow the pattern: https://www.reddit.com/r/SUBREDDIT/.rss ' +
      'HN keyword feeds: https://hnrss.org/newest?q=YOUR+KEYWORDS',
    parameters: {
      product_id: { type: 'string', description: 'Product ID to attach this station to' },
      name:       { type: 'string', description: 'Friendly name for this station' },
      platform:   { type: 'string', description: 'Source type: rss | hn | reddit | twitter_search' },
      rss_url:    { type: 'string', description: 'Full RSS feed URL' },
      keyword:    { type: 'string', description: 'Primary keyword context for this feed', optional: true },
    },
    execute: async (params: Record<string, unknown>) =>
      api.post('/stations/add', params),
  })

  // ------------------------------------------------------------------
  // RELOAD PRODUCTS (after adding new ones)
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_reload_products',
    description:
      'Hot-reload the product cache on the backend after adding or editing products. ' +
      'No server restart needed. Call this after signalpipe_add_product.',
    parameters: {},
    execute: async () => api.post('/products/reload'),
  })
}
