# SignalPipe

**Agentic sales pipeline for AI-powered lead discovery and prospect nurturing.**

SignalPipe gives your AI agent a full sales stack — from detecting buying signals on Reddit and Hacker News to closing warm prospects with context-aware messages. Works with any OpenClaw-compatible agent.

[signalpipe.io](https://signalpipe.io) · [ClawHub](https://clawhub.io/plugins/signalpipe)

---

## What It Does

**Top of funnel (Mantidae):** Continuously scouts RSS feeds, Reddit, and Hacker News for posts matching your products' buying-intent profiles. Scores each signal with a lightweight embedding model + LLM swarm, then surfaces the best leads for human approval — complete with an AI-drafted reply.

**Mid/bottom of funnel (Nurture Engine):** Tracks every prospect's temperature (0–100), automatically selects the right persona (Educator → Consultant → Closer → Re-engager), and generates the next message when you ask. Remembers objections, respects timing, and never spams.

---

## Tools (10 total)

| Tool | What it does |
|---|---|
| `signalpipe_get_missions` | Fetch pending leads awaiting review |
| `signalpipe_approve_mission` | Approve a lead and queue for outreach |
| `signalpipe_reject_mission` | Reject a lead (improves RL scoring) |
| `signalpipe_scout_now` | Trigger an immediate scouting run |
| `signalpipe_get_products` | List active monitored products |
| `signalpipe_add_product` | Register a new product for lead monitoring |
| `signalpipe_add_station` | Add an RSS/Reddit/HN feed for a product |
| `signalpipe_reload_products` | Hot-reload product cache after changes |
| `signalpipe_track_prospect` | Log a prospect signal, update temperature |
| `signalpipe_get_message` | Generate the next outreach message |
| `signalpipe_get_pipeline` | View full prospect pipeline sorted by heat |

---

## Live Session Example

What a typical morning lead review looks like inside your OpenClaw agent.

---

**You:** Show me today's leads.

```
→ signalpipe_get_missions
```

```
3 missions pending review

MISSION 1 · score: 81 · competitor_flag: true
Product : AcmeTool
Channel : reddit_dm
Handle  : u/frustrated_dev99
Snippet : "Their pricing just doubled again. Not paying for features we
           don't use. Anyone tried alternatives for team task automation?"
Draft   : "Hey — saw your post, had the same frustration. We built AcmeTool
           around exactly this — no bloat, just the automation piece.
           Happy to share how we differ if it's useful."

MISSION 2 · score: 67 · competitor_flag: false
Product : AcmeTool
Channel : reddit_dm
Handle  : u/ops_lead_rachel
Snippet : "Looking for a tool to automate repetitive ops workflows.
           Budget is flexible, need something the team actually uses."
Draft   : "We built AcmeTool for this exact problem — teams use it without
           training because it fits how they already work.
           Happy to show you a real example?"

MISSION 3 · score: 28 · competitor_flag: false
Product : AcmeTool
Channel : reddit_dm
Handle  : u/just_browsing_thx
Snippet : "Saw an ad for workflow tools. Not really something I need
           right now but interesting I guess"
Draft   : "Thanks for checking us out!"
```

**Agent:** 3 leads ready. Lead 1 is a competitor-switch signal — someone explicitly frustrated with a named competitor, score 81. Lead 2 is a direct need statement with flexible budget, score 67. Lead 3 is low-intent casual browsing, score 28 — recommend reject.

Approve 1 and 2, or do you want to edit the drafts first?

---

**You:** Lead 1 is good, approve it. Reject lead 3. For lead 2 change the draft to: "Hey Rachel — we solve exactly this. Most ops teams are running automations within a day. Want me to show you how a team like yours uses it?"

```
→ signalpipe_approve_mission (msn_8f3a — AI draft unchanged)
→ signalpipe_reject_mission  (msn_c44d)
→ signalpipe_approve_mission (msn_2b91 — user-edited draft)
```

```
✓ msn_8f3a queued for outreach
✓ msn_c44d rejected — RL weight adjusted for this product
✓ msn_2b91 queued for outreach (your version)
```

**Agent:** Done. Lead 3's rejection will lower the scoring weight for similar low-intent posts going forward.

---

**You:** Rachel just replied on Reddit — she seemed interested. Log it.

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

**Agent:** Rachel is now in Sales mode, temperature 45. Consultant persona active — qualify and show fit, no hard sell yet.

---

**You:** Show me my full pipeline.

```
→ signalpipe_get_pipeline
```

```
Pipeline: 12 prospects

● Closing  (75–100)   2 prospects
  → u/sarah_cto        temp 88   last: booked_demo
  → u/mike_founder     temp 82   last: asked_pricing

◑ Sales    (30–74)    7 prospects
  → u/ops_lead_rachel  temp 45   last: replied       ← just added
  → u/dev_team_james   temp 62   last: viewed_content
  → ...

○ Recovery (0–29)     3 prospects
  → u/ghost_since_jan  temp 14   last: ghosted_7_days
  → ...
```

**Agent:** 2 in Closing — sarah_cto booked a demo, she's your hottest follow-up. Want me to generate a message for her?

---

**You:** Yes. Message for sarah_cto.

```
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

**Agent:** Closing mode, friction-removal tactic. Her previous pricing objection is on record — the AI avoided that angle automatically. Ready to send, or want to edit?

---

## Quick Start

### 1. Get a backend

**Managed (recommended):** Sign up at [signalpipe.io/pricing](https://signalpipe.io/pricing) — you get an `OPERATOR_KEY` and a backend URL instantly. No infrastructure to manage.

**Self-hosted:** See [Self-Hosting](#self-hosting) below.

### 2. Install the plugin on OpenClaw

```bash
claw install signalpipe
```

Or add to your `openclaw.config.json`:
```json
{
  "plugins": ["signalpipe"]
}
```

### 3. Set environment variables

Before starting the OpenClaw gateway:
```bash
export SIGNALPIPE_API_URL=https://your-backend-url
export SIGNALPIPE_OPERATOR_KEY=your-operator-key
```

### 4. Start using it

Ask your agent:
- "Show me my pending leads"
- "Add my SaaS tool as a product to monitor"
- "Who should I follow up with today?"
- "Generate a message for @prospect_handle"

---

## How Scoring Works

Each incoming post goes through three stages:

1. **Keyword gate** — cheap pre-filter: any `buy_signal_keywords` must appear before the post is scored (~85% of posts eliminated here, zero API cost)
2. **Embedding similarity** — cosine similarity against pre-cached anchor vectors using OpenAI `text-embedding-3-small`; buyer-perspective phrases like "I need X" or "looking for alternative to Y"
3. **Sarcasm detection** — LLM check that distinguishes genuine buyers from casual venting or irony; fails open so real leads are never suppressed
4. **LLM swarm** — three AI judges (Skeptic, Analyst, Optimist) evaluate independently via concurrent threads; a hard skeptic veto suppresses any signal the most skeptical judge dismisses outright

Competitor-switch posts are hard-floored and always reach your review queue regardless of general intent score.

The final score feeds a per-product learning loop: approvals nudge the weight up, rejections nudge it down. The asymmetry is intentional — conservative about boosting, aggressive about penalizing. The system gets sharper the more you use it.

---

## Temperature Model

The Nurture Engine tracks a 0–100 temperature for each prospect:

| Range | Mode | Behavior |
|---|---|---|
| 0–29 | Recovery | Re-spark cold leads, no hard sell |
| 30–74 | Sales | Qualify, show fit, build trust |
| 75–100 | Closing | Urgency, social proof, clear CTA |

**13 signal types** map to calibrated heat deltas:

| Signal | Direction |
|---|---|
| `booked_demo` | Strong positive |
| `asked_pricing` | Strong positive |
| `viewed_content` | Positive |
| `replied` | Positive |
| `clicked_link` | Positive |
| `not_decision_maker` | Neutral |
| `ghosted_3_days` | Negative |
| `no_time` | Negative |
| `competitor` | Negative |
| `too_expensive` | Negative |
| `not_interested` | Strong negative |
| `bad_timing` | Strong negative |
| `ghosted_7_days` | Strong negative |

**One-directional mode transitions** — once a prospect reaches Closing, they never regress to Sales. Once in Recovery, they only re-enter Sales when they warm again. No oscillation, no spam.

**Objection memory** — recorded objections (`too_expensive`, `competitor`, `bad_timing`, `no_time`, `not_decision_maker`) persist permanently and are injected into every future message generation call, along with the last 6 interactions. The AI never repeats a pitch angle that already failed.

---

## Managed Backend Tiers

| Tier | Price | Products | Leads/day | Prospects |
|---|---|---|---|---|
| Starter | $49/mo | 3 | 50 | 500 |
| Growth | $149/mo | 10 | 250 | 5,000 |
| Scale | $399/mo | Unlimited | Unlimited | Unlimited |

[View pricing →](https://signalpipe.io/pricing)

---

## License

Plugin: MIT
Backend: Business Source License 1.1 (converts to Apache 2.0 after 4 years)

---

## Self-Hosting

The backend is a FastAPI app. You will need:
- Python 3.11+
- PostgreSQL with `pg_cron` and `pg_net` extensions (Supabase recommended)
- A host that supports long-running processes (Railway recommended)
- OpenAI API key (embeddings) and Anthropic API key (message generation)

The sidecar handles outreach execution. Set these to enable each channel:

**Reddit DM outreach:**
```bash
export REDDIT_CLIENT_ID=your_reddit_app_id
export REDDIT_CLIENT_SECRET=your_reddit_app_secret
export MAX_REDDIT_DMS_PER_DAY=5   # default: 5
```

**Twitter / X reply outreach** (requires X API Basic tier or above):
```bash
export X_API_KEY=your_x_api_key
export X_API_SECRET=your_x_api_secret
export X_ACCESS_TOKEN=your_access_token
export X_ACCESS_SECRET=your_access_token_secret
export MAX_TWITTER_ACTIONS_PER_DAY=10   # default: 10
```

Both channels are optional. If credentials are not set, that outreach channel is silently skipped and the mission stays queued.

Full setup guide: [signalpipe.io/guide#self-hosting](https://signalpipe.io/guide#self-hosting)
