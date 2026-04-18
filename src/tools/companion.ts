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
 * Adaptive Sales Companion tools.
 * Covers mid-to-bottom funnel: prospect tracking → message generation → pipeline visibility.
 */
export function registerCompanionTools(openClaw: any): void {

  openClaw.registerTool({
    name: 'signalpipe_track_prospect',
    description:
      'Log a signal from a prospect and update their temperature. ' +
      'Creates the prospect automatically if they are new. ' +
      'Call this whenever a prospect takes any action: replies, asks pricing, ghosts, books a demo, etc. ' +
      'Returns their new temperature, mode, and recommended follow-up timing.',
    parameters: Type.Object({
      handle: Type.String({ description: 'Prospect identifier — Twitter handle, Reddit username, email, etc.' }),
      channel: Type.String({ description: 'Channel: twitter | reddit_dm | whatsapp | telegram | email | discord' }),
      signal: Type.String({
        description:
          'What the prospect did: booked_demo | asked_pricing | viewed_content | clicked_link | replied | ' +
          'not_interested | too_expensive | no_time | competitor | not_decision_maker | ' +
          'bad_timing | ghosted_3_days | ghosted_7_days',
      }),
      product_id: Type.Optional(Type.String({ description: 'Product ID this prospect is interested in' })),
      mission_id: Type.Optional(Type.String({ description: 'Mantidae mission ID that initiated this relationship' })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      try { return ok(await api.post('/companion/track', params)) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_get_message',
    description:
      'Generate the next outreach message for a prospect based on their temperature, ' +
      'mode, objection history, and product context. ' +
      'LLM-generated — natural, human-sounding, value-first, under 280 characters. ' +
      'Always present to the user for review before sending.',
    parameters: Type.Object({
      prospect_id: Type.String({ description: 'Prospect ID (returned by signalpipe_track_prospect)' }),
    }),
    async execute(_id: string, params: { prospect_id: string }) {
      try { return ok(await api.post('/companion/message', { prospect_id: params.prospect_id })) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_get_pipeline',
    description:
      'Get the full prospect pipeline sorted by temperature (hottest first). ' +
      'Includes summary counts per mode. ' +
      'Call this when the user asks "how is my pipeline", "who should I follow up with", or "show me hot prospects".',
    parameters: Type.Object({}),
    async execute(_id: string) {
      try { return ok(await api.get('/companion/pipeline')) } catch (e) { return err(e) }
    },
  })
}
