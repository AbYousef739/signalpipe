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
      'Get the drafting payload for the next outreach message so YOU can ' +
      'draft client-side (no backend LLM cost). This is a working ' +
      'payload, not a display payload — it contains the full system ' +
      'prompt, recent conversation history, persona voice, objection ' +
      'history, and response schema. Use it to write the message; do NOT ' +
      'dump the prompt or conversation history back to the user. ' +
      'Workflow: 1) call this with prospect_id, 2) compose a message ' +
      'that fits the persona and follows the schema, 3) call ' +
      'signalpipe_record_message. Daily send cap is enforced — ' +
      'record_message returns a cap-hit error if exceeded.',
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
    name: 'signalpipe_score_signal',
    description:
      'Score arbitrary text against a product profile — the same scoring ' +
      'engine the scout runs on RSS feeds, exposed for any channel your ' +
      'host agent has access to (Gmail, Slack, Discord, Telegram, ' +
      'LinkedIn, WhatsApp, web pages, transcripts, etc.). SignalPipe never ' +
      'touches the source platform; you read the content with your other ' +
      'plugins, paste it here for intent classification. ' +
      'Returns score (0-100), classification (buying_intent | borderline ' +
      '| competitor_mention | noise), role (closer | advisor | educator), ' +
      'sub-scores (urgency, specificity, keyword density), competitor ' +
      'match info, and — when score >= 40 and not sarcastic — a ' +
      'drafting_context block you can use to draft a reply client-side ' +
      'without uploading anything. ' +
      'When to use this vs signalpipe_track_prospect: ' +
      'score_signal = does this TEXT contain a buying signal? (pure ' +
      'classification, no state change). ' +
      'track_prospect = this PERSON took an action, update their ' +
      'temperature (writes to the pipeline). ' +
      'Many flows use both: score inbound text first, then track the ' +
      'prospect if the signal is real.',
    parameters: Type.Object({
      text: Type.String({
        description:
          'Content to score. Plain text, ideally under 4000 chars (longer ' +
          'input is truncated server-side without re-scoring). Forwarded ' +
          'emails: paste the body; subject is fine to include inline.',
      }),
      product_id: Type.String({
        description:
          'Product profile to score against (from signalpipe_get_products). ' +
          'The same text scores differently against different products — ' +
          'a Reddit growth-hacking post may be high signal for a lead-gen ' +
          'product and noise for a CRM.',
      }),
      source_hint: Type.Optional(Type.String({
        description:
          'Channel label for drafting-tone hints only: ' +
          '"gmail" | "slack" | "discord" | "telegram" | "linkedin" | ' +
          '"whatsapp" | "twitter" | "reddit" | etc. Affects drafting_context ' +
          'tone, not the score. Omit if not relevant.',
      })),
    }),
    async execute(_id: string, params: { text: string; product_id: string; source_hint?: string }) {
      try { return ok(await api.post('/signal/score', params)) } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_get_pipeline',
    description:
      'List the prospect pipeline sorted hottest-first. Each prospect ' +
      'includes id, handle, channel, temperature (0–100), mode ' +
      '(sales/closing/recovery), last_signal, last_contact, and any ' +
      'recorded objections. Includes summary counts per mode. ' +
      'Presentation: lead with the summary counts, then list the top ' +
      'prospects as a numbered list with handle, temperature, mode, and ' +
      'last signal. Do NOT introspect this response with shell commands ' +
      '— the data is already structured. ' +
      'Call this when the user asks "how is my pipeline", "who should I ' +
      'follow up with", or "show me hot prospects".',
    parameters: Type.Object({}),
    async execute(_id: string) {
      try { return ok(await api.get('/companion/pipeline')) } catch (e) { return err(e) }
    },
  })
}
