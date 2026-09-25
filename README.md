# SignalPipe

**Agentic sales pipeline — buying-intent detection, swarm-scored lead qualification, and prospect nurturing for OpenClaw agents.**

SignalPipe judges whether the author of a post, email or ticket wants to buy. Your agent brings the text from anywhere it reads, including X through your own X API access, and an optional scout reads the RSS or Atom feeds you choose. Three independent judges rule on every borderline signal, the reply is calibrated to how strong the signal was, and only real leads reach you for approval. Works with any OpenClaw-compatible agent — or connect directly via MCP from Claude Code, Cursor, or Windsurf.

[signalpipe.io](https://signalpipe.io)

---

## What It Does

**Top of funnel — Signal Acquisition (Mantidae):**
Your agent brings text from anywhere it reads, and the optional scout reads the RSS or Atom feeds you choose every cycle. Clear-cut posts are decided on content alone; borderline ones go to three independent judges (Skeptic, Analyst, Optimist), and when they split you see it. Only real leads reach your queue, with a draft already calibrated to how strong the signal is:

- **Closer (highest-intent):** Direct, action-oriented reply — proposes a concrete next step
- **Advisor (mid-intent):** Consultative — acknowledges the problem, introduces the product naturally
- **Educator (early-stage):** Value-first — leads with a genuine insight, mentions the product only if it fits

Competitor-switch posts are hard-floored and always reach your queue regardless of score.

**Mid/bottom of funnel — Nurture Engine:**
Tracks every prospect's temperature (0–100) across 13 signal types. Automatically selects the right persona (Educator → Consultant → Closer → Re-engager). Remembers objections permanently — if someone said the price is too high, that angle is never repeated. Never spams. One-directional mode transitions.

**Execution — Sender (v2.0):**
The brain scores, drafts, and approves; the plugin can now also **send**. An optional background sender holds a live stream open to the brain, receives the missions you've already approved, and posts `reddit_comment` / `reddit_dm` on Reddit with **your own** credentials. *The math runs on us, the sending runs on you* — your Reddit credentials and LLM keys never reach SignalPipe. `twitter_reply` is handled by the standalone [`signalpipe-daemon`](https://github.com/AbYousef739/signalpipe-daemon). The sender is opt-in: set the `REDDIT_*` env vars to enable it, or ignore it entirely and stay MCP-only. Private messages go only to someone who asked for one: Reddit and X both require the recipient's consent before an app sends one. SignalPipe never auto-sends a DM or an X reply; each waits for your approval.

---

## Tools (29 total)

### Signal Acquisition

| Tool | What it does |
|---|---|
| `signalpipe_get_missions` | List pending leads awaiting review — score, role, channel, snippet, draft. Lean by default; opt into `include_context=true` only when drafting. |
| `signalpipe_draft_mission` | Get the drafting payload for a single mission so the host LLM can write the reply itself (BYOK path) |
| `signalpipe_upload_draft` | Upload a host-LLM-written draft to a mission |
| `signalpipe_approve_mission` | Approve a lead and queue it for outreach |
| `signalpipe_reject_mission` | Reject a lead with a reason — teaches the per-station RL loop (penalty size adapts to the reason; demotes one noisy feed without dragging the rest of the product down). **Don't** use this when the post is just gone — use `signalpipe_delete_mission` instead. |
| `signalpipe_delete_mission` | Hard-delete a mission row — silent cleanup, no learning signal. Companion to reject. **Canonical case:** the post was deleted / 404'd / removed before you could reply. |
| `signalpipe_mark_sent` | Record that you replied by hand, so follow-ups know what was said and the source feed gets the credit |
| `signalpipe_scout_now` | Trigger an on-demand scouting run across your active products |
| `signalpipe_get_products` | List all configured products |
| `signalpipe_suggest_anchors` | Draft buyer-voice anchor sentences for a product, for you to edit before adding it |
| `signalpipe_add_product` | Register a new product to monitor — describe it in buyer language |
| `signalpipe_update_product` | Edit a product's anchors or description, or pause and resume it |
| `signalpipe_add_station` | Add an RSS feed, subreddit, or HN keyword feed for a product |
| `signalpipe_list_stations` | Your feeds with a health readout: posts captured, posts that reached your queue, and what to change |
| `signalpipe_update_station` | Pause, resume, rename or re-point a feed |
| `signalpipe_remove_station` | Remove a feed (one with history is switched off instead, to keep it) |
| `signalpipe_reload_products` | Hot-reload product cache after changes — no redeploy needed |

### Nurture Engine

| Tool | What it does |
|---|---|
| `signalpipe_track_prospect` | Log a signal from a prospect, update their temperature |
| `signalpipe_record_reply` | Send a prospect's reply to the brain, which reads it: intent, objections, do-not-contact, and whether they invited a private message |
| `signalpipe_get_message` | Generate the next outreach message via the backend LLM |
| `signalpipe_get_message_prompt` | Get the full prompt + context so the host LLM writes the message (BYOK path) |
| `signalpipe_record_message` | Record a host-LLM-written message as sent |
| `signalpipe_get_pipeline` | View the full prospect pipeline sorted by temperature |
| `signalpipe_score_signal` | Universal scorer — paste any text (Gmail, Slack, Discord, Telegram, LinkedIn, transcripts) and get back the same score + classification + drafting context the scout produces for Reddit/HN posts. For a reply or comment, pass the post it answers as `context`. `panel_verdict` says what the judges decided. SignalPipe never touches the source channel; your host agent does. |

### Sender

Reddit-only; requires the optional `REDDIT_*` env vars. Contains no scoring or drafting — it only posts pre-approved missions with your credentials.

| Tool | What it does |
|---|---|
| `signalpipe_start_sender` | Start the background sender — streams approved missions and posts `reddit_comment` / `reddit_dm` with your own Reddit creds. Supports `dry_run`. |
| `signalpipe_stop_sender` | Stop the background sender; unsent approved missions stay queued on the brain |
| `signalpipe_sender_status` | Report sender state — running / connected, sent / failed / skipped counts this session, plus brain-side queue depth |

### Reader

Reads feeds from this machine. No credentials and no extra dependencies.

| Tool | What it does |
|---|---|
| `signalpipe_read_feeds` | Read the client-marked stations from this machine and send each feed page to the brain for judging. One pass by default; `every_minutes` keeps reading in the background, `stop` ends it. |
| `signalpipe_preview_station` | Check a feed for buyers before adding it: read here, judged by the brain, nothing saved. Answers VIABLE, MARGINAL, ON-TOPIC NOT IN-MARKET, NO BUYERS or NO DATA. |

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

Subscribe at [signalpipe.io](https://signalpipe.io/#pricing), sign in to the [console](https://signalpipe.io/dashboard) with the email you paid with, and create your `SIGNALPIPE_OPERATOR_KEY` there (it is shown once). The backend URL is `https://api.signalpipe.io`. No infrastructure to manage.

### 2. Install

**Via OpenClaw:**
```bash
openclaw plugins install signalpipe
# or from ClawHub:
openclaw plugins install clawhub:signalpipe
```

**Via MCP (no plugin install):** Add the MCP server URL to Claude.ai, Cursor, or Windsurf — see [MCP Support](#mcp-support) above.

### 3. Set environment variables

```bash
export SIGNALPIPE_API_URL=https://api.signalpipe.io
export SIGNALPIPE_OPERATOR_KEY=your-operator-key
```

**Optional — to run the in-plugin Reddit sender (v2.0):** add a Reddit "script" app's credentials (create one at https://www.reddit.com/prefs/apps on the sending account; since November 2025 Reddit reviews new API apps under its Responsible Builder Policy before issuing them). These stay on your machine and are never sent to SignalPipe.

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
> *"Set up my product. It's called AcmeTool, it automates repetitive ops workflows, and it's bought by ops leads and founders."*

The agent drafts buyer-voice anchors with `signalpipe_suggest_anchors` (for example *"we're drowning in the same manual handoffs every week"*), shows them to you to edit, then adds the product. Before adding a feed, have it run `signalpipe_preview_station` on the feed: it says whether buyers actually post there.

The signal engine activates on the next scout cycle.

---

## How Scoring Works

Every incoming post passes through two sequential pipelines.

**Pipeline 1 — Scoring (backend):**

1. **Optional keyword gate** — only if you set `buy_signal_keywords`. A post matching none of them is dropped before anything reads it, so leave the list empty unless your buyers use a fixed vocabulary.
2. **Multi-factor semantic scoring** — embedding similarity, urgency, specificity, and keyword density. Multilingual: English, Spanish, French, German, Portuguese, Finnish.
3. **Sarcasm detection** — distinguishes genuine buyers from venting or irony. Fails open — real leads are never suppressed by the sarcasm check.

**Pipeline 2 — Swarm Drafting (managed backend):**

Posts that survive scoring reach a 3-judge AI swarm:

| Judge | Role |
|---|---|
| Skeptic | Vetoes non-buyers, sellers promoting their own tools, surveys |
| Analyst | Assesses fit depth, writes the preferred draft |
| Optimist | Finds the strongest read of the lead, fallback draft |

The judges run concurrently, and their scores are fused via a weighted ensemble. Low-confidence leads are auto-rejected — they never reach your queue. High-confidence leads get a draft calibrated to signal strength:

- **Closer (highest-intent):** Proposes a concrete next step — demo link, trial, or direct ask
- **Advisor (mid-intent):** Consultative — acknowledges situation, introduces product naturally
- **Educator (early-stage):** Value-first — answers their question, mentions product only if it fits

**Reinforcement learning:** Every approve/reject adjusts the source station's RL weight — each listening feed (subreddit, HN search, RSS source) carries its own multiplier. Approvals reward the feed; rejections are reason-aware, with the penalty sized to how bad the signal was — spam is penalised hardest, then wrong-audience, then weak or no-reason rejections, while sarcasm and wrong-product are lighter and "already a customer" carries no penalty. Per-station scoping means one noisy feed gets demoted without penalising the rest of the product's sources.

---

## Temperature Model

Mode is **intent-based**, not pure temperature. Brand-new prospects start in
`nurture` regardless of their starting temperature and only move out once a
real signal lands.

| Mode | When | Persona |
|---|---|---|
| Nurture | First-touch / no engagement yet (default for new prospects) | Educator — value-first, lead with insight, mention the product only if it fits |
| Sales | Prospect engaged (replied / clicked / asked / viewed) and temperature reached 50 | Consultant — qualify, show fit, build trust |
| Closing | Sustained engagement and temperature ≥ 75 | Closer — urgency, social proof, clear CTA |
| Recovery | Previously engaged and cooled, **or** explicit cooling signal (ghosted_3_days, ghosted_7_days, not_interested, bad_timing) | Re-engager — re-spark cold leads, no hard sell |
| Dead | Asked not to be contacted (a reply that opted out, or the `opted_out` signal) | None: no further messages are drafted |

**14 signal types** map to calibrated heat deltas: `booked_demo`, `asked_pricing`, `viewed_content`, `replied`, `clicked_link`, `not_decision_maker`, `ghosted_3_days`, `no_time`, `competitor`, `too_expensive`, `not_interested`, `bad_timing`, `ghosted_7_days`, `opted_out`. With the reply text in hand, `signalpipe_record_reply` reads it and sets the signal for you.

**One-directional mode transitions** — no oscillation, no spam. **Objection memory** — permanently recorded and injected into every future message so the AI never repeats a failed angle.

---

## Pricing

The plugin and the daemon are free and MIT licensed. The managed brain — scoring and drafting — is a subscription, metered in **judgements** (one three-judge panel run). Text that is clearly noise or clearly a buyer is decided without convening the panel and spends nothing.

| Plan | Price | Judgements / month |
|---|---|---|
| Starter | $29/mo | 3,000 |
| Growth | $79/mo | 9,000 |

Billed monthly through Stripe; cancel any time from your billing page. Every scoring call returns how much of the month is left. Current details: [signalpipe.io/pricing](https://signalpipe.io/pricing).

---

## Reading your feeds on this machine

Some stations can be read from your own machine instead of by the brain: they show `read_by: "client"` in `/stations/list`. `signalpipe_read_feeds` fetches those feeds from here, at most 50 posts per feed with a pause between feeds, and hands each page to the brain, which scores the posts as if its own scout had read them. Run it once, or with `every_minutes` to keep reading. The standalone [signalpipe-daemon](https://github.com/AbYousef739/signalpipe-daemon) does the same with `signalpipe-daemon read`.

## Checking a feed before you add it

`signalpipe_preview_station` reads a candidate feed on this machine and has the brain judge its best-matching posts, without saving anything. The verdict comes from thresholds fixed in advance: **VIABLE** (real buyers post here), **MARGINAL** (a trickle), **ON-TOPIC, NOT IN-MARKET** (people discuss your topic but nobody is asking to buy, usually makers or support questions), **NO BUYERS**, or **NO DATA** (nothing could be judged; the explanation says why, such as an empty or stale feed or keywords that blocked every post). Each judged post costs one judgement. Which communities you listen to decides results more than any setting, so check before you add.

## Sending from your own accounts

The drafts are written by AI. Reddit asks that AI-generated content be disclosed, and both Reddit and X act against automated posting, so read and edit each draft in your own words before it goes out. Public Reddit comments, X replies and DMs are never sent without a person approving each one.

The in-plugin sender posts approved missions with a Reddit **script app** on your account. Since 11 November 2025 Reddit issues new API apps only after a manual approval, so if you do not already have one, skip the sender: approve drafts in your agent, post them yourself, and the queue works the same. X sending lives in [signalpipe-daemon](https://github.com/AbYousef739/signalpipe-daemon) and needs a paid (pay-per-use) X API account.

---

## License

Plugin: MIT. The managed brain is a hosted service and is not distributed.
