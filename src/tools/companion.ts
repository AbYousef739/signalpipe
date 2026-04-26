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
      'Generate the next outreach message for a prospect using the backend LLM. ' +
      'Uses their temperature, mode, objection history, and product context. ' +
      'Natural, human-sounding, value-first, under 280 characters. ' +
      'Always present to the user for review before sending. ' +
      'If you prefer to draft client-side (cheaper, more flexible), use ' +
      'signalpipe_get_message_prompt + signalpipe_record_message instead.',
    parameters: Type.Object({
      prospect_id: Type.String({ description: 'Prospect ID (returned by signalpipe_track_prospect)' }),
    }),
    async execute(_id: string, params: { prospect_id: string }) {
      try { return ok(await api.post('/companion/message', { prospect_id: params.prospect_id })) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_get_message_prompt',
    description:
      'Fetch the system prompt and conversation context for a prospect so YOU can draft ' +
      'the next message client-side (no backend LLM cost). Returns persona voice, ' +
      'objection history, days-since-contact, and a response schema. ' +
      'After drafting, call signalpipe_record_message to log the sent message.',
    parameters: Type.Object({
      prospect_id: Type.String({ description: 'Prospect ID (returned by signalpipe_track_prospect)' }),
    }),
    async execute(_id: string, params: { prospect_id: string }) {
      try {
        return ok(await api.post('/companion/message?mode=prompt', { prospect_id: params.prospect_id }))
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_record_message',
    description:
      'Record a client-generated outreach message as sent. Use this after you drafted ' +
      'a message client-side via signalpipe_get_message_prompt. Daily cap still applies — ' +
      'will 429 if this prospect already hit the daily send limit.',
    parameters: Type.Object({
      prospect_id: Type.String({ description: 'Prospect ID' }),
      message:     Type.String({ description: 'The message you sent (under 280 chars)' }),
      tactic:      Type.Optional(Type.String({ description: 'Short label — e.g. "soft_followup", "ROI_angle"' })),
      next_step:   Type.Optional(Type.String({ description: 'What to do after this message — e.g. "wait 3 days"' })),
    }),
    async execute(_id: string, params: { prospect_id: string; message: string; tactic?: string; next_step?: string }) {
      try {
        return ok(await api.post('/companion/message?mode=record', params))
      } catch (e) { return err(e) }
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
