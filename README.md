# SignalPipe

**Agentic sales pipeline for AI-powered lead discovery and prospect nurturing.**

SignalPipe gives your Claude agent a full sales stack — from detecting buying signals on Reddit and Hacker News to closing warm prospects with context-aware messages.

[signalpipe.io](https://signalpipe.io) · [ClawHub](https://clawhub.io/plugins/signalpipe)

---

## What It Does

**Top of funnel (Mantidae):** Continuously scouts RSS feeds, Reddit, and Hacker News for posts matching your products' buying-intent profiles. Scores each signal with a lightweight embedding model + LLM swarm, then surfaces the best leads for human approval — complete with an AI-drafted reply.

**Mid/bottom of funnel (Companion):** Tracks every prospect's temperature (0–100), automatically selects the right persona (Educator → Consultant → Closer → Re-engager), and generates the next message when you ask. Remembers objections, respects timing, and never spams.

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

### 1. Deploy the backend

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

The backend is a FastAPI app requiring:
- Supabase PostgreSQL (with `pg_cron` + `pg_net` extensions)
- OpenAI API key (embeddings)
- Anthropic API key (message generation)

Set these environment variables on Railway:
```
SUPABASE_URL=...
SUPABASE_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
OPERATOR_KEY=your-secret-key
```

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
export SIGNALPIPE_API_URL=https://your-app.up.railway.app
export SIGNALPIPE_OPERATOR_KEY=your-secret-key
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

1. **Keyword gate** — cheap pre-filter: any `buy_signal_keywords` must appear
2. **Embedding similarity** — cosine similarity against your product's anchor sentences (buyer-perspective phrases like "I need X" or "looking for alternative to Y")
3. **LLM swarm** — three judges weighted: Skeptic (40%) + Analyst (35%) + Optimist (25%). Skeptic can hard-veto a lead at score < 0.3.

The final score drives RL weight updates: approvals push the weight up, rejections push it down. Floor 0.5, ceiling 2.0.

---

## Temperature Model

The Companion tracks a 0–100 temperature for each prospect:

| Range | Mode | Behavior |
|---|---|---|
| 0–29 | Nurture | Educate, add value, no ask |
| 30–59 | Sales | Qualify, show fit |
| 60–84 | Closing | Urgency, social proof, CTA |
| 85+ | Recovery | Re-spark cold leads |

Signal events adjust temperature. Example deltas:
`booked_demo (+20)`, `asked_pricing (+15)`, `ghosted_7_days (-15)`, `not_interested (-25)`

---

## Managed Backend Tiers

| Tier | Price | Products | Leads/day | Prospects |
|---|---|---|---|---|
| Starter | $49/mo | 3 | 50 | 500 |
| Growth | $149/mo | 10 | 250 | 5,000 |
| Scale | $399/mo | Unlimited | Unlimited | Unlimited |

[Start free trial →](https://signalpipe.io/pricing)

---

## License

Plugin: MIT
Backend: Business Source License 1.1 (converts to Apache 2.0 after 4 years)

---

## Self-Hosting

The backend source is available for self-hosting under BUSL. You need:
- Python 3.11+
- PostgreSQL (Supabase recommended for `pg_cron`)
- Railway or any host that supports long-running processes

See `/api/README.md` in the backend repo for full self-hosting instructions.
