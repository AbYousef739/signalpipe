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

1. **Keyword gate** — cheap pre-filter: any `buy_signal_keywords` must appear before the post is scored
2. **Embedding similarity** — semantic match against your product's anchor sentences (buyer-perspective phrases like "I need X" or "looking for alternative to Y")
3. **LLM swarm** — a panel of AI judges with different levels of skepticism evaluates each lead; a hard skeptic veto suppresses low-confidence signals entirely

The final score feeds a per-product learning loop: approvals push the score threshold up for similar leads, rejections push it down. The system gets sharper the more you use it.

---

## Temperature Model

The Nurture Engine tracks a 0–100 temperature for each prospect:

| Range | Mode | Behavior |
|---|---|---|
| 0–29 | Recovery | Re-spark cold leads, no hard sell |
| 30–74 | Sales | Qualify, show fit, build trust |
| 75–100 | Closing | Urgency, social proof, clear CTA |

Warm signals (booking a demo, asking about pricing) move the prospect forward quickly. Cold signals (ghosting, objections) cool them down. The system balances both directions automatically.

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

See `/api/README.md` in the backend repo for full setup instructions.
