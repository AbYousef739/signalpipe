# SignalPipe

**Agentic sales pipeline — buying-intent detection, swarm-scored lead qualification, and prospect nurturing for OpenClaw agents.**

SignalPipe watches Reddit, Hacker News, X/Twitter, and any RSS feed you configure for people publicly expressing buying intent. A 3-judge AI swarm evaluates every signal, calibrates the reply to the signal strength, and surfaces only real leads for your approval. Works with any OpenClaw-compatible agent — or connect directly via MCP from Claude Code, Cursor, or Windsurf.

[signalpipe.io](https://signalpipe.io)

---

## What It Does

**Top of funnel — Signal Acquisition (Mantidae):**
Scouts Reddit, Hacker News, X/Twitter, and custom RSS feeds every cycle. Every post passes through a 3-stage scoring filter — keyword gate, multi-factor semantic scoring, sarcasm detection — then reaches a 3-judge AI drafting swarm: Skeptic, Analyst, Optimist. Each judge scores the lead independently. The swarm fuses their scores and suppresses low-intent posts automatically. Only leads that clear the swarm reach your queue — with a draft already calibrated to how hot the signal is:

- **Score > 80 (Closer):** Direct, action-oriented reply — proposes a concrete next step
- **Score 61–80 (Advisor):** Consultative — acknowledges the problem, introduces the product naturally
- **Score 40–60 (Educator):** Value-first — leads with a genuine insight, mentions the product only if it fits

Competitor-switch posts are hard-floored and always reach your queue regardless of score.

**Mid/bottom of funnel — Nurture Engine:**
Tracks every prospect's temperature (0–100) across 13 signal types. Automatically selects the right persona (Educator → Consultant → Closer → Re-engager). Remembers objections permanently — if someone said the price is too high, that angle is never repeated. Never spams. One-directional mode transitions.

**Execution — Sender (v2.0):**
The brain scores, drafts, and approves; the plugin can now also **send**. An optional background sender holds a live stream open to the brain, receives the missions you've already approved, and posts `reddit_comment` / `reddit_dm` on Reddit with **your own** credentials. *The math runs on us, the sending runs on you* — your Reddit credentials and LLM keys never reach SignalPipe. `twitter_reply` is handled by the standalone [`signalpipe-daemon`](https://github.com/AbYousef739/signalpipe-daemon). The sender is opt-in: set the `REDDIT_*` env vars to enable it, or ignore it entirely and stay MCP-only.

---

## Tools (20 total)

### Signal Acquisition

| Tool | What it does |
|---|---|
| `signalpipe_get_missions` | List pending leads awaiting review — score, role, channel, snippet, draft. Lean by default; opt into `include_context=true` only when drafting. |
| `signalpipe_draft_mission` | Get the drafting payload for a single mission so the host LLM can write the reply itself (BYOK path) |
| `signalpipe_upload_draft` | Upload a host-LLM-written draft to a mission |
| `signalpipe_approve_mission` | Approve a lead and queue it for outreach |
| `signalpipe_reject_mission` | Reject a lead with a reason — teaches the per-station RL loop (penalty size adapts to the reason; demotes one noisy feed without dragging the rest of the product down). **Don't** use this when the post is just gone — use `signalpipe_delete_mission` instead. |
| `signalpipe_delete_mission` | Hard-delete a mission row — silent cleanup, no learning signal. Companion to reject. **Canonical case:** the post was deleted / 404'd / removed before you could reply. |
| `signalpipe_scout_now` | Trigger an on-demand scouting run across all active products |
| `signalpipe_get_products` | List all configured products |
| `signalpipe_add_product` | Register a new product to monitor — describe it in buyer language |
| `signalpipe_add_station` | Add an RSS feed, subreddit, or HN keyword feed for a product |
| `signalpipe_reload_products` | Hot-reload product cache after changes — no redeploy needed |

### Nurture Engine

| Tool | What it does |
|---|---|
| `signalpipe_track_prospect` | Log a signal from a prospect, update their temperature |
| `signalpipe_get_message` | Generate the next outreach message via the backend LLM |
| `signalpipe_get_message_prompt` | Get the full prompt + context so the host LLM writes the message (BYOK path) |
| `signalpipe_record_message` | Record a host-LLM-written message as sent |
| `signalpipe_get_pipeline` | View the full prospect pipeline sorted by temperature |
| `signalpipe_score_signal` | Universal scorer — paste any text (Gmail, Slack, Discord, Telegram, LinkedIn, transcripts) and get back the same score + classification + drafting context the scout produces for Reddit/HN posts. SignalPipe never touches the source channel; your host agent does. |

### Sender

Reddit-only; requires the optional `REDDIT_*` env vars. Contains no scoring or drafting — it only posts pre-approved missions with your credentials.

| Tool | What it does |
|---|---|
| `signalpipe_start_sender` | Start the background sender — streams approved missions and posts `reddit_comment` / `reddit_dm` with your own Reddit creds. Supports `dry_run`. |
| `signalpipe_stop_sender` | Stop the background sender; unsent approved missions stay queued on the brain |
| `signalpipe_sender_status` | Report sender state — running / connected, sent / failed / skipped counts this session, plus brain-side queue depth |

---

## MCP Support

SignalPipe exposes all tools as an MCP server — no OpenClaw plugin install needed.

Connect from Claude Code, Cursor, or Windsurf — add this URL to your MCP config:
```
https://api.signalpipe.io/mcp
```
Auth: `Authorization: Bearer YOUR_OPERATOR_KEY`

Once connected, ask your agent:
- *"Show me my leads"*
- *"Reject the first one — it's a founder promoting their own tool"*
- *"Who should I follow up with today?"*

---

## Live Session Example

A typical morning lead review inside your OpenClaw agent or Claude.ai via MCP.

---

**You:** Show me today's leads.

```
→ signalpipe_get_missions
```

```
3 missions pending review

MISSION 1 · score: 91 · role: CLOSER · competitor_flag: true
Product : AcmeTool
Channel : reddit_dm
Handle  : u/frustrated_dev99
Snippet : "Their pricing just doubled again. Done. Need a replacement ASAP."
Draft   : "Saw your post — we built AcmeTool for exactly the gap you're
           describing. Teams typically switch in under a week. Worth a
           quick look? Happy to show you how it compares."

MISSION 2 · score: 68 · role: ADVISOR · competitor_flag: false
Product : AcmeTool
Channel : reddit_dm
Handle  : u/ops_lead_rachel
Snippet : "Looking for a tool to automate repetitive ops workflows.
           Budget is flexible, need something the team actually uses."
Draft   : "The part about 'something the team actually uses' is the real
           problem to solve — most tools fail there, not on features.
           AcmeTool is built around that constraint. Happy to walk through
           a real team setup if useful."

MISSION 3 · score: 24 · role: EDUCATOR · competitor_flag: false
Product : AcmeTool
Channel : reddit_dm
Handle  : u/just_browsing_thx
Snippet : "Saw an ad for workflow tools. Not really something I need right now"
Draft   : [Swarm low-confidence — auto-rejected]
```

**Agent:** 2 leads ready. Lead 1 is a competitor-switch signal, score 91 — Closer draft, proposes a direct next step. Lead 2 is a genuine need with flexible budget, score 68 — Advisor draft, leads with their real problem. Lead 3 was auto-rejected by the swarm. Approve 1 and 2, or edit first?

---

**You:** Lead 1 is good, approve it. For lead 2 change the draft to: "Hey Rachel — we solve exactly this. Most ops teams are running automations within a day. Want me to show you how a team like yours uses it?"

```
→ signalpipe_approve_mission (msn_8f3a — swarm draft unchanged)
→ signalpipe_approve_mission (msn_2b91 — user-edited draft)
```

```
✓ msn_8f3a queued for outreach
✓ msn_2b91 queued for outreach (your version)
```

---

**You:** Rachel just replied — she's interested. Log it.

```
→ signalpipe_track_prospect
  handle    : u/ops_lead_rachel
  channel   : reddit_dm
  signal    : replied
  mission_id: msn_2b91
```

```json
{
  "prospect_id": "pro_7f2c",
  "handle": "u/ops_lead_rachel",
  "temperature": 45,
  "mode": "sales",
  "persona": "Consultant",
  "follow_up_in": "2–3 days"
}
```

**Agent:** Rachel is in Sales mode, temperature 45. Consultant persona active — qualify and show fit, no hard sell yet.

---

**You:** Who's hottest? Generate a message for them.

```
→ signalpipe_get_pipeline
→ signalpipe_get_message (prospect_id: pro_sarah_cto)
```

```json
{
  "message": "Sarah — you've seen how it works. Happy to answer any last
              questions before your team makes a call. What's the main
              thing you're still weighing?",
  "tactic": "remove_friction",
  "mode": "closing",
  "temperature": 88,
  "note": "Previous objection (too_expensive) on record — pricing angle avoided"
}
```

**Agent:** Closing mode, friction-removal tactic. Her previous pricing objection is permanently on record — the AI avoided that angle automatically.

---

## Quick Start

### 1. Get a backend + operator key

**Managed (recommended):** Join the waitlist at [signalpipe.io](https://signalpipe.io) — you get a `SIGNALPIPE_OPERATOR_KEY` and backend URL. No infrastructure to manage.

**Self-hosted:** See [Self-Hosting](#self-hosting) below.

### 2. Install

**Via OpenClaw:**
```bash
claw install signalpipe
```

**Via MCP (no plugin install):** Add the MCP server URL to Claude.ai, Cursor, or Windsurf — see [MCP Support](#mcp-support) above.

### 3. Set environment variables

```bash
export SIGNALPIPE_API_URL=https://api.signalpipe.io
export SIGNALPIPE_OPERATOR_KEY=your-operator-key
```

**Optional — to run the in-plugin Reddit sender (v2.0):** add a Reddit "script" app's credentials (create one at https://www.reddit.com/prefs/apps on the sending account). These stay on your machine and are never sent to SignalPipe.

```bash
export REDDIT_CLIENT_ID=your-client-id
export REDDIT_CLIENT_SECRET=your-client-secret
export REDDIT_USERNAME=your-sending-account
export REDDIT_PASSWORD=your-password
# optional caps (defaults shown)
# export MAX_REDDIT_COMMENTS_PER_DAY=15
# export MAX_REDDIT_DMS_PER_DAY=5
```

### 4. Configure a product

Ask your agent:
> *"Add my product — it's called AcmeTool, it helps ops teams automate repetitive workflows, target audience is ops leads and founders, anchor phrases: 'automate repetitive tasks', 'workflow automation', 'ops without headcount'"*

The signal engine activates on the next scout cycle.

---

## How Scoring Works

Every incoming post passes through two sequential pipelines.

**Pipeline 1 — Scoring (backend):**

1. **Keyword gate** — pre-filter: any `buy_signal_keywords` must appear before the post is scored. Eliminates ~85% of posts with zero API cost.
2. **Multi-factor semantic scoring** — embedding similarity, urgency, specificity, and keyword density. Multilingual: English, Spanish, French, German, Portuguese.
3. **Sarcasm detection** — distinguishes genuine buyers from venting or irony. Fails open — real leads are never suppressed by the sarcasm check.

**Pipeline 2 — Swarm Drafting (managed backend):**

Posts that survive scoring reach a 3-judge AI swarm:

| Judge | Role | Weight |
|---|---|---|
| Skeptic | Vetoes non-buyers, sellers promoting their own tools, surveys | 40% |
| Analyst | Assesses fit depth, writes the preferred draft | 35% |
| Optimist | Finds the strongest read of the lead, fallback draft | 25% |

The judges run concurrently. Their scores are fused via ensemble weighting. Low-confidence leads are auto-rejected — they never reach your queue. High-confidence leads get a draft calibrated to signal strength:

- **Closer (>80):** Proposes a concrete next step — demo link, trial, or direct ask
- **Advisor (61–80):** Consultative — acknowledges situation, introduces product naturally
- **Educator (40–60):** Value-first — answers their question, mentions product only if it fits

**Reinforcement learning:** Every approve/reject adjusts the source station's RL weight — each listening feed (subreddit, HN search, RSS source) carries its own multiplier. Approvals are flat (+0.05); rejections are reason-aware (spam −0.04, not_relevant −0.03, no_reason / too_vague −0.02, sarcasm / wrong_product −0.01, already_customer 0.00). Per-station scoping means one noisy feed gets demoted without penalising the rest of the product's sources.

---

## Temperature Model

Mode is **intent-based**, not pure temperature. Brand-new prospects start in
`nurture` regardless of their starting temperature and only move out once a
real signal lands.

| Mode | When | Persona |
|---|---|---|
| Nurture | First-touch / no engagement yet (default for new prospects) | Educator — value-first, lead with insight, mention the product only if it fits |
| Sales | Prospect engaged (replied / clicked / asked / viewed) and temperature 30–74 | Consultant — qualify, show fit, build trust |
| Closing | Sustained engagement and temperature ≥ 75 | Closer — urgency, social proof, clear CTA |
| Recovery | Previously engaged and cooled, **or** explicit cooling signal (ghosted_3_days, ghosted_7_days, not_interested, bad_timing) | Re-engager — re-spark cold leads, no hard sell |

**13 signal types** map to calibrated heat deltas: `booked_demo`, `asked_pricing`, `viewed_content`, `replied`, `clicked_link`, `not_decision_maker`, `ghosted_3_days`, `no_time`, `competitor`, `too_expensive`, `not_interested`, `bad_timing`, `ghosted_7_days`.

**One-directional mode transitions** — no oscillation, no spam. **Objection memory** — permanently recorded and injected into every future message so the AI never repeats a failed angle.

---

## Managed Backend Tiers

| Tier | Price | Products | Leads/day | Prospects |
|---|---|---|---|---|
| BYOK | $19/mo | 3 | 50 | 1,000 |
| Starter | $49/mo | 2 | 25 | 500 |
| Growth | $149/mo | 10 | 250 | 5,000 |
| Scale | $499/mo | Unlimited | Unlimited | Unlimited |

Annual billing available — 2 months free (17% off). First 100 waitlist signups: 50% off for 3 months.

[View pricing →](https://signalpipe.io/pricing)

---

## Self-Hosting

The backend is a FastAPI app. Requirements:
- Python 3.11+
- PostgreSQL with `pg_cron` and `pg_net` (Supabase recommended)
- A host that supports long-running processes (Railway recommended)
- OpenAI API key (embeddings)

Full setup guide: [signalpipe.io/guide#self-hosting](https://signalpipe.io/guide#self-hosting)

---

## License

Plugin: MIT  
Backend: Business Source License 1.1 (converts to Apache 2.0 after 4 years)
