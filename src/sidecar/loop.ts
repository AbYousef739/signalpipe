/**
 * SignalPipe Sidecar — Background Loop
 *
 * Polls the backend every 60 seconds for pending missions.
 * Draft phase:     fires LLM swarm via UniversalBrain, uploads draft
 * Execution phase: sends approved missions via Twitter reply or Reddit DM
 *
 * Runs silently inside the OpenClaw process — no separate deployment needed.
 * Clients bring their own keys: LLM key for drafting, Reddit/Twitter for outreach.
 */

import {
  API_URL,
  OPERATOR_KEY,
  X_API_KEY,
  X_API_SECRET,
  X_ACCESS_TOKEN,
  X_ACCESS_SECRET,
  REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET,
  REDDIT_USERNAME,
  REDDIT_PASSWORD,
  MAX_TWITTER_ACTIONS,
  MAX_REDDIT_DMS,
  AUTO_APPROVE_THRESHOLD,
} from '../config'
import { UniversalBrain } from './brain'

// ── Daily counters (reset at midnight) ───────────────────────────────────────

let counterDate  = new Date().toDateString()
let twitterToday = 0
let redditToday  = 0

function resetDailyCounters(): void {
  const today = new Date().toDateString()
  if (today !== counterDate) {
    counterDate  = today
    twitterToday = 0
    redditToday  = 0
  }
}

// ── Internal API helpers ──────────────────────────────────────────────────────

function apiHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${OPERATOR_KEY}`,
    'Content-Type':  'application/json',
  }
}

async function callAPI(
  method: string,
  path:   string,
  body?:  object,
): Promise<any> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: apiHeaders(),
      body:    body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    try { return JSON.parse(text) } catch { return text }
  } catch (e) {
    console.error(`   ⚠️  API error [${method} ${path}]:`, e)
    return null
  }
}

// ── Outreach executors ────────────────────────────────────────────────────────

interface ExecResult { status: string; error?: string }

async function executeTwitterReply(
  draft:   string,
  leadUrl: string,
): Promise<ExecResult> {
  if (twitterToday >= MAX_TWITTER_ACTIONS)
    return { status: 'failed', error: 'Daily Twitter limit reached' }
  if (!X_API_KEY)
    return { status: 'failed', error: 'No Twitter credentials — handle manually' }

  try {
    const { TwitterApi } = await import('twitter-api-v2')
    const client = new TwitterApi({
      appKey:       X_API_KEY,
      appSecret:    X_API_SECRET,
      accessToken:  X_ACCESS_TOKEN,
      accessSecret: X_ACCESS_SECRET,
    })
    const tweetId = leadUrl.split('/').pop() || ''
    if (/^\d+$/.test(tweetId)) {
      await client.v2.reply(draft, tweetId)
    } else {
      await client.v2.tweet(draft)
    }
    twitterToday++
    // Anti-spam jitter: 30–90 seconds
    await new Promise(r => setTimeout(r, 30_000 + Math.random() * 60_000))
    return { status: 'success' }
  } catch (e: any) {
    return { status: 'failed', error: String(e?.message ?? e) }
  }
}

async function executeRedditDM(
  draft:        string,
  authorHandle: string,
): Promise<ExecResult> {
  if (redditToday >= MAX_REDDIT_DMS)
    return { status: 'failed', error: 'Daily Reddit DM limit reached' }
  if (!REDDIT_CLIENT_ID)
    return { status: 'failed', error: 'No Reddit credentials — handle manually' }
  if (!authorHandle)
    return { status: 'failed', error: 'No author handle to DM' }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const snoowrapModule = await import('snoowrap')
    const Snoowrap = (snoowrapModule as any).default ?? snoowrapModule
    const reddit = new Snoowrap({
      userAgent:    'signalpipe/1.1.0 openclaw-plugin',
      clientId:     REDDIT_CLIENT_ID,
      clientSecret: REDDIT_CLIENT_SECRET,
      username:     REDDIT_USERNAME,
      password:     REDDIT_PASSWORD,
    })
    await (reddit as any).composeMessage({
      to:      authorHandle.replace(/^u\//, ''),
      subject: 'Quick question',
      text:    draft,
    })
    redditToday++
    // Reddit rate-limits hard — 60–180 second jitter
    await new Promise(r => setTimeout(r, 60_000 + Math.random() * 120_000))
    return { status: 'success' }
  } catch (e: any) {
    return { status: 'failed', error: String(e?.message ?? e) }
  }
}

// ── Single tick ───────────────────────────────────────────────────────────────

async function runSidecarTick(brain: UniversalBrain): Promise<void> {
  resetDailyCounters()

  const data = await callAPI('GET', '/sync/missions')
  if (!data || !Array.isArray(data.missions) || data.missions.length === 0) return

  console.log(`\n📋 ${data.missions.length} mission(s) in queue`)

  for (const m of data.missions) {
    const product = (m.products ?? {}) as Record<string, any>
    const lead    = (m.leads    ?? {}) as Record<string, any>

    // ── DRAFT PHASE ──────────────────────────────────────────────────────
    if (m.status === 'draft_needed' && brain.active) {
      const productName = product.name ?? '?'
      const leadId      = String(m.lead_id ?? '').slice(0, 8)
      console.log(`\n🧠 [${productName}] Drafting lead ${leadId}...`)

      let snippet = `Title: ${lead.title ?? ''}\n\nPost: ${lead.snippet ?? ''}`
      if (lead.competitor_match) {
        snippet += `\n\n[Mentions competitor: ${lead.competitor_name ?? ''}]`
      }

      const result = await brain.swarmCondensation(snippet, product)

      if (result) {
        await callAPI('POST', '/actions/upload_draft', {
          id:      m.id,
          content: result.draft,
        })
        console.log(`   ✅ Uploaded (confidence: ${result.fused_score})`)

        if (AUTO_APPROVE_THRESHOLD > 0 && result.fused_score >= AUTO_APPROVE_THRESHOLD) {
          await callAPI('POST', '/actions/approve', { id: m.id })
          console.log(
            `   ⚡ Auto-approved (score ${result.fused_score} ≥ threshold ${AUTO_APPROVE_THRESHOLD})`
          )
        }
      } else {
        await callAPI('POST', '/actions/ack', {
          id:     m.id,
          status: 'failed',
          error:  'swarm_suppressed',
        })
        console.log('   🛑 Suppressed by swarm — skipped')
      }
    }

    // ── EXECUTION PHASE ──────────────────────────────────────────────────
    else if (m.status === 'approved') {
      const channel = (m.outreach_channel ?? 'manual') as string
      const draft   = ((m.draft_content  ?? '') as string).trim()
      console.log(`\n🚀 Executing [${channel}]: ${draft.slice(0, 60)}...`)

      let execResult: ExecResult

      if (channel === 'twitter_reply') {
        execResult = await executeTwitterReply(draft, lead.url ?? '')
      } else if (channel === 'reddit_dm') {
        execResult = await executeRedditDM(draft, lead.author_handle ?? '')
      } else {
        // manual — draft is surfaced to agent; user sends from their own account
        execResult = { status: 'success' }
      }

      await callAPI('POST', '/actions/ack', {
        id:     m.id,
        status: execResult.status,
        error:  execResult.error ?? null,
      })

      const icon = execResult.status === 'success' ? '✅' : '❌'
      console.log(
        `   ${icon} ${execResult.status}` +
        (execResult.error ? `: ${execResult.error}` : '')
      )
    }
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function startSidecar(): void {
  const brain = new UniversalBrain()

  console.log('\n🦐 SignalPipe sidecar ONLINE')
  console.log(`   Brain   : ${brain.providerName.toUpperCase()} / ${brain.modelName}`)
  console.log(`   Twitter : ${X_API_KEY      ? 'ACTIVE' : 'inactive — set X_API_KEY for auto-reply'}`)
  console.log(`   Reddit  : ${REDDIT_CLIENT_ID ? 'ACTIVE' : 'inactive — set REDDIT_CLIENT_ID for DMs'}`)
  console.log(`   Backend : ${API_URL}`)
  console.log(`   Auto-approve threshold: ${AUTO_APPROVE_THRESHOLD > 0 ? AUTO_APPROVE_THRESHOLD : 'off (all manual)'}`)

  if (!brain.active) {
    console.warn(
      '\n   ⚠️  No LLM key found — sidecar will poll but cannot draft replies.\n' +
      '       Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY to enable drafting.'
    )
  }

  // Run immediately, then every 60 seconds
  runSidecarTick(brain).catch(e => console.error('Sidecar tick error:', e))
  setInterval(
    () => runSidecarTick(brain).catch(e => console.error('Sidecar tick error:', e)),
    60_000,
  )
}
