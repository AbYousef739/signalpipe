import { api } from '../api/client'

/**
 * Adaptive Sales Companion tools.
 * Covers mid-to-bottom funnel: prospect tracking → message generation → pipeline visibility.
 *
 * The Companion uses a temperature model (0–100) to track how warm each prospect is
 * and dispatches the right agent persona (Educator → Consultant → Closer → Re-engager)
 * based on their current state.
 */
export function registerCompanionTools(openClaw: any): void {

  // ------------------------------------------------------------------
  // TRACK PROSPECT SIGNAL
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_track_prospect',
    description:
      'Log a signal from a prospect and update their temperature. ' +
      'Creates the prospect automatically if they are new. ' +
      'Call this whenever a prospect takes any action: replies, asks pricing, ghosts, objects, books a demo, etc. ' +
      'Returns their new temperature, mode, and recommended follow-up timing.',
    parameters: {
      handle: {
        type: 'string',
        description: 'Prospect identifier — Twitter handle, Reddit username, email address, phone number, etc.',
      },
      channel: {
        type: 'string',
        description: 'Channel where the interaction happened: twitter | reddit_dm | whatsapp | telegram | email | discord',
      },
      signal: {
        type: 'string',
        description:
          'What the prospect did. Valid signals: ' +
          'booked_demo | asked_pricing | viewed_content | clicked_link | replied | ' +
          'not_interested | too_expensive | no_time | competitor | not_decision_maker | ' +
          'bad_timing | ghosted_3_days | ghosted_7_days',
      },
      product_id: {
        type: 'string',
        description: 'Product ID this prospect is interested in (from signalpipe_get_products)',
        optional: true,
      },
      mission_id: {
        type: 'string',
        description: 'Mantidae mission ID that initiated this relationship (optional)',
        optional: true,
      },
    },
    execute: async (params: Record<string, unknown>) =>
      api.post('/companion/track', params),
  })

  // ------------------------------------------------------------------
  // GET NEXT MESSAGE
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_get_message',
    description:
      'Generate the next outreach message for a prospect based on their current temperature, ' +
      'mode, objection history, and product context. ' +
      'The message is LLM-generated — natural, human-sounding, value-first, under 280 characters. ' +
      'Returns the message text, the tactic being used, and the recommended next step. ' +
      'After getting the message, present it to the user for review before sending.',
    parameters: {
      prospect_id: {
        type: 'string',
        description: 'Prospect ID (returned by signalpipe_track_prospect)',
      },
    },
    execute: async ({ prospect_id }: { prospect_id: string }) =>
      api.post('/companion/message', { prospect_id }),
  })

  // ------------------------------------------------------------------
  // GET PIPELINE
  // ------------------------------------------------------------------
  openClaw.registerTool({
    name: 'signalpipe_get_pipeline',
    description:
      'Get the full prospect pipeline sorted by temperature (hottest first). ' +
      'Includes a summary count of how many prospects are in each mode. ' +
      'Call this when the user asks "how is my pipeline looking", ' +
      '"who should I follow up with", or "show me hot prospects".',
    parameters: {},
    execute: async () => api.get('/companion/pipeline'),
  })
}
