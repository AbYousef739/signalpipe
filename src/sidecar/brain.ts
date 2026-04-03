/**
 * SignalPipe Sidecar — Universal Brain
 *
 * Fires a 3-persona LLM swarm concurrently (Optimist · Skeptic · Analyst)
 * and fuses their scores into a single confidence value.
 *
 * Provider priority: Anthropic (Claude Haiku) → OpenAI (gpt-4o-mini) → Gemini (flash)
 * Uses native fetch — no heavy SDK dependencies.
 *
 * Fusion weights: Skeptic 40% · Analyst 35% · Optimist 25%
 * Hard gate:      Skeptic score < 0.3 → suppressed entirely
 * Draft source:   Analyst preferred, Optimist as fallback
 */

import {
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
  GEMINI_API_KEY,
} from '../config'

type Provider = 'anthropic' | 'openai' | 'gemini' | null

interface SwarmResult {
  score:     number
  draft:     string
  reasoning: string
}

export interface SidecarDraft {
  draft:       string
  fused_score: number
}

const JSON_SCHEMA =
  'Respond ONLY with valid JSON matching this exact schema: ' +
  '{"score": <float 0.0-1.0>, "draft": "<reply under 280 chars>", "reasoning": "<one sentence>"}'

export class UniversalBrain {
  private provider: Provider
  private key:      string
  private model:    string

  constructor() {
    if (ANTHROPIC_API_KEY) {
      this.provider = 'anthropic'
      this.key      = ANTHROPIC_API_KEY
      this.model    = 'claude-haiku-4-5-20251001'
    } else if (OPENAI_API_KEY) {
      this.provider = 'openai'
      this.key      = OPENAI_API_KEY
      this.model    = 'gpt-4o-mini'
    } else if (GEMINI_API_KEY) {
      this.provider = 'gemini'
      this.key      = GEMINI_API_KEY
      this.model    = 'gemini-2.0-flash'
    } else {
      this.provider = null
      this.key      = ''
      this.model    = ''
    }
  }

  get active():        boolean { return this.provider !== null }
  get providerName():  string  { return this.provider || 'NONE' }
  get modelName():     string  { return this.model    || '-' }

  // ── Single LLM call ──────────────────────────────────────────────────────

  private async generate(
    systemPrompt: string,
    userContent:  string,
  ): Promise<SwarmResult | null> {
    if (!this.provider) return null

    try {
      if (this.provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method:  'POST',
          headers: {
            'x-api-key':         this.key,
            'anthropic-version': '2023-06-01',
            'content-type':      'application/json',
          },
          body: JSON.stringify({
            model:      this.model,
            max_tokens: 512,
            system:     systemPrompt + '\n\n' + JSON_SCHEMA,
            messages:   [{ role: 'user', content: userContent }],
          }),
        })
        const data = await res.json() as any
        return JSON.parse(data.content[0].text) as SwarmResult
      }

      if (this.provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${this.key}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            model:           this.model,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt + '\n\n' + JSON_SCHEMA },
              { role: 'user',   content: userContent },
            ],
          }),
        })
        const data = await res.json() as any
        return JSON.parse(data.choices[0].message.content) as SwarmResult
      }

      if (this.provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.key}`
        const res = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: systemPrompt + '\n\nRespond with valid JSON only.\n\n' + JSON_SCHEMA + '\n\n' + userContent,
              }],
            }],
          }),
        })
        const data = await res.json() as any
        let text: string = data.candidates[0].content.parts[0].text.trim()
        if (text.startsWith('```')) {
          text = text.split('```')[1]
          if (text.startsWith('json')) text = text.slice(4)
          text = text.trim()
        }
        const start = text.indexOf('{')
        if (start > 0) text = text.slice(start)
        return JSON.parse(text) as SwarmResult
      }
    } catch (e) {
      console.error(`   ⚠️  LLM error (${this.provider}):`, e)
    }

    return null
  }

  // ── 3-Judge Swarm ────────────────────────────────────────────────────────

  async swarmCondensation(
    leadContext: string,
    product:    Record<string, any>,
  ): Promise<SidecarDraft | null> {
    const name     = product.name            || 'our product'
    const vp       = product.value_prop      || ''
    const audience = product.target_audience || ''

    const base =
      `Product name: ${name}\n` +
      `Value proposition: ${vp}\n` +
      `Target audience: ${audience}\n\n` +
      `Lead post:\n${leadContext}`

    const personas = {
      optimist:
        `You are an enthusiastic sales rep evaluating a lead. ${JSON_SCHEMA} ` +
        `The draft must be genuinely helpful first — mention the product only if it naturally fits. ` +
        `Never start the draft with 'I' or the product name.`,
      skeptic:
        `You are a skeptical sales manager. Assume this lead may be noise. ${JSON_SCHEMA} ` +
        `Set score < 0.3 if this is not a genuine buying signal. Be harsh. The draft should still be helpful.`,
      analyst:
        `You are a data-driven analyst. Find the real software gap in the post. ${JSON_SCHEMA} ` +
        `Estimate fit between the lead's stated need and the product's value prop. ` +
        `Ignore hype; score only true buying intent.`,
    }

    console.log('   🌪️  Spawning swarm (Optimist · Skeptic · Analyst)...')

    const fallback: SwarmResult = { score: 0.5, draft: '', reasoning: 'parse_error' }

    const [optimistRes, skepticRes, analystRes] = await Promise.all([
      this.generate(personas.optimist, base).then(r => r ?? fallback),
      this.generate(personas.skeptic,  base).then(r => r ?? fallback),
      this.generate(personas.analyst,  base).then(r => r ?? fallback),
    ])

    const sScore = typeof skepticRes.score  === 'number' ? skepticRes.score  : 0.0
    const aScore = typeof analystRes.score  === 'number' ? analystRes.score  : 0.5
    const oScore = typeof optimistRes.score === 'number' ? optimistRes.score : 0.5

    // Hard gate — Skeptic veto
    if (sScore < 0.3) {
      console.log(`   🛑 Skeptic suppressed (score: ${sScore.toFixed(2)})`)
      return null
    }

    // Weighted fusion: Skeptic 40% · Analyst 35% · Optimist 25%
    const fused = (sScore * 0.40) + (aScore * 0.35) + (oScore * 0.25)
    console.log(
      `   🧠 Fused: ${fused.toFixed(2)}` +
      `  (S:${sScore.toFixed(2)} A:${aScore.toFixed(2)} O:${oScore.toFixed(2)})`
    )

    if (fused < 0.40) return null

    // Prefer Analyst draft; fall back to Optimist
    const draft = (analystRes.draft || optimistRes.draft || '').trim()
    if (!draft) return null

    return { draft, fused_score: Math.round(fused * 1000) / 1000 }
  }
}
