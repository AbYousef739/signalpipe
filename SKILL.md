---
name: signalpipe
description: Agentic sales pipeline — detects buying-intent signals on Reddit, HN, and RSS feeds, drafts replies (server-side or client-side via host LLM), nurtures prospects from cold to closed, and (v2.0) sends approved Reddit replies and DMs with your own credentials.
version: 2.0.1
metadata:
  openclaw:
    requires:
      env:
        - SIGNALPIPE_API_URL
        - SIGNALPIPE_OPERATOR_KEY
    primaryEnv: SIGNALPIPE_API_URL
    emoji: "🦐"
    homepage: "https://signalpipe.io"
---

# SignalPipe — Skill Guide for OpenClaw Agents

SignalPipe gives you a full agentic sales pipeline:
**signal detection → human review → prospect nurturing → pipeline visibility → sending.**

Three subsystems, twenty tools. Use them in sequence.

> **v2.0.0 — the sender lands.** SignalPipe v4 splits the work cleanly: *the math runs on us, the sending runs on you.* The brain still scores, drafts, and approves; the plugin can now ALSO **send**. Three new tools — `signalpipe_start_sender`, `signalpipe_stop_sender`, `signalpipe_sender_status` — run a background loop that streams pre-approved missions from the brain and posts `reddit_comment` / `reddit_dm` on Reddit with the operator's OWN credentials (a Reddit "script" app set via the optional `REDDIT_*` env vars). `twitter_reply` missions are left for the standalone `signalpipe-daemon`. The sender contains **zero** scoring, drafting, or storage — Reddit credentials stay on the operator's machine and are never sent to SignalPipe. Within a running session each mission is posted at most once (no double-send), even across reconnects; daily caps *skip* (not fail) a capped mission so it stays queued. MCP-only operators who never set `REDDIT_*` are unaffected — the sender simply stays idle. See **Subsystem 3 — Sender** below.

> **v1.6.2 — reject vs delete clarity for stale posts.** When a post is gone by the time the operator gets there (deleted by the poster, 404, removed by mods, or stale beyond the reply window), the lead wasn't bad — the opportunity just evaporated. Use `signalpipe_delete_mission` (no RL penalty), NOT `signalpipe_reject_mission(not_relevant)` (which would penalise a station that did nothing wrong). The tool descriptions and the reject / delete sections below have been clarified accordingly. No tool surface change — this is presentation only, aligning the LLM-facing guidance with mantidae backend v3.7.13 + v3.7.14 (which also added cross-poster dedup and locked swarm temperature to 0.2 for deterministic classification).

> **v1.6.0 — universal signal scoring.** New `signalpipe_score_signal` exposes the scout's scoring engine for arbitrary text from any channel your host agent can read (Gmail, Slack, Discord, Telegram, LinkedIn, web pages, transcripts). You paste content, you get back score, classification, role, sub-scores, competitor info, and a drafting context block for client-side replies — without polling a feed or creating a mission. Lives in the Companion subsystem because the use-case is multi-channel and mid-funnel.

> **v1.5.0 — response contract + delete_mission.** Listings (`signalpipe_get_missions`, `signalpipe_get_pipeline`, `signalpipe_get_products`) return lean payloads by default — `include_context=true` is opt-in. Drafting tools are framed as **working payloads, not display payloads** — use them to write the draft, don't dump them to the user. New `signalpipe_delete_mission` is the silent-cleanup companion to `signalpipe_reject_mission` (which teaches the RL loop).

> **v1.4.0 — Client-side drafting.** Mission drafts and prospect messages can be generated using YOUR LLM instead of the SignalPipe backend. Use `signalpipe_draft_mission` + `signalpipe_upload_draft` for missions, and `signalpipe_get_message_prompt` + `signalpipe_record_message` for prospect nurture. The backend-LLM equivalent `signalpipe_get_message` still works — pick whichever fits.

---

## Subsystem 1 — Mantidae (Top of Funnel)

Mantidae scouts the web for buying signals and queues them as missions for review.

### Tool: `signalpipe_get_missions`
Fetch all pending missions awaiting human approval.

**When to call:** User asks "show me my leads", "what needs review", "check the pipeline".

**Returns:** Array of missions, each with:
- `id` — mission ID (use for approve/reject)
- `product_name` — which product this lead is for
- `signal_score` — 0–100 buying-intent score, adaptive based on your approval/rejection history
- `competitor_flag` — true if a competitor was mentioned
- `channel` — where to reach them (`twitter_reply` | `reddit_dm` | `manual` | etc.)
- `handle` — prospect's username/email
- `lead_snippet` — the text that triggered the signal
- `source_url` — direct link to the original post or tweet
- `ai_draft` — AI-generated reply, ready to send

**How to present missions to the user:**
Always show: score · channel · handle · snippet · draft.
For `manual` channel missions, always show the `source_url` as a clickable link — the user needs to open the original post themselves to reply. Label it clearly: "Open post → [URL]"
For `reddit_dm` or `twitter_reply`, the backend handles delivery — just show the draft for approval.

**Example workflow:**
```
User: "Show me today's leads"
→ Call signalpipe_get_missions
→ For each mission present:
    Score · Channel · Handle
    What they said: [snippet]
    Draft: [ai_draft]
    (if manual) Open post → [source_url]
→ Ask user to approve, reject, or edit each one
```

---

### Tool: `signalpipe_approve_mission`
Approve a mission and queue it for outreach.

**When to call:** User says "approve this", "send it", "looks good".

**Before calling:** Always confirm the mission ID and draft text with the user first.
If the user edited the draft, pass their version via `draft`. Otherwise omit it.

**Parameters:**
- `mission_id` (required) — the `id` from `signalpipe_get_missions`
- `draft` (optional) — edited message text; omit to use the AI draft unchanged

**After calling:** Tell the user it's queued. Offer to move on to the next mission.

---

### Tool: `signalpipe_reject_mission`
Reject a mission — it was not a real buying signal. Teaches the RL loop.

**When to call:** User says "skip", "not relevant", "bad lead", "reject" — and you have any opinion on WHY it was bad. If the user just wants the row gone with no learning signal, use `signalpipe_delete_mission` instead.

**DO NOT call when the post is gone.** If the user says the post was deleted, 404'd, removed by mods, or has gone stale beyond the reply window — that's `signalpipe_delete_mission`, not `signalpipe_reject_mission`. The lead wasn't a bad signal; the opportunity just evaporated. Using `reject_mission(not_relevant)` here applies an RL penalty to a station that did nothing wrong.

**Effect:** Sets the mission status to rejected and nudges the RL weight down by a per-reason amount. Accuracy directly improves how the system learns.

| Reason | Penalty | When to pick |
|---|---|---|
| `spam` | heaviest | Bot, promoted, automated post |
| `not_relevant` | heavy | Wrong audience or topic |
| `wrong_product` | light | Real signal, wrong product matched |
| `too_vague` | moderate | Signal too weak to act on |
| `sarcasm` | light | Ironic / venting, not a real buyer |
| `already_customer` | none | They bought — no penalty |
| `no_reason` | moderate | Default if you have no opinion |

**Parameters:**
- `mission_id` (required)
- `rejection_reason` (optional) — pick the closest reason from the table. The reason accumulates into `products.rejection_stats` for analytics.

---

### Tool: `signalpipe_delete_mission`
Hard-delete a mission row — silent queue cleanup, no learning signal.

**When to call:** User says "just delete this", "clear it", "I don't care, get rid of it" — or when you want to clear duplicates / accidental scrapes that the RL loop should not learn from.

**Canonical case — the post is gone.** If the user says the post was deleted by the poster, 404'd, removed by mods, or has gone stale beyond their reply window, `signalpipe_delete_mission` is the right tool. The lead wasn't wrong, the opportunity just evaporated — there's nothing to teach the station. Using `signalpipe_reject_mission` here would penalise a station that did nothing wrong.

**Effect:** Removes the row entirely. The source feed's scoring weight is untouched.

**When to prefer `signalpipe_reject_mission` instead:** Any time you can categorise WHY the lead was bad. Reject teaches the RL loop with a per-reason penalty; delete throws away the learning signal. Default to reject when in doubt — but DO default to delete when the post is just gone.

**Parameters:**
- `mission_id` (required)

---

### Tool: `signalpipe_scout_now`
Trigger an immediate scouting run.

**When to call:** User says "check for new leads now", "run a fresh scan", "scout immediately".
Normally scouts run automatically every 10 minutes — only call this for on-demand runs.

**No parameters.**

---

### Tool: `signalpipe_get_products`
List all active products being monitored.

**When to call:** User asks "what products do you track", "show me my products", or before adding a station (you need the `product_id`).

---

### Tool: `signalpipe_add_product`
Register a new product for lead monitoring.

**When to call:** User wants to start tracking leads for a new product.

**Key parameters:**
- `anchor_sentences` — most important field. Write them as a buyer speaking:
  - "I need a tool that does X"
  - "looking for an alternative to Y"
  - "where can I find Z"
- `buy_signal_keywords` — cheap pre-filter keywords (any match = post gets scored)
- `competitor_keywords` — competitor names to flag

**After calling:** Always call `signalpipe_reload_products` to activate immediately.

---

### Tool: `signalpipe_add_station`
Add an RSS feed or search source to monitor for a product.

**When to call:** User wants to monitor a new subreddit, Hacker News keyword, or RSS feed.

**Common patterns:**
- Reddit: `https://www.reddit.com/r/SUBREDDIT/.rss`
- Hacker News: `https://hnrss.org/newest?q=YOUR+KEYWORDS`

**Parameters:**
- `product_id` — from `signalpipe_get_products`
- `platform` — `rss` | `hn` | `reddit` (active monitoring); `twitter_search` routes leads to Twitter reply outreach but does not monitor Twitter feeds — X direct monitoring is not yet supported
- `rss_url` — full feed URL (Reddit and HN use RSS URLs; leave empty for `twitter_search`)

---

### Tool: `signalpipe_reload_products`
Hot-reload the product cache after adding or editing products.

**When to call:** Always after `signalpipe_add_product`. No server restart needed.

**No parameters.**

---

## Subsystem 2 — Companion (Mid/Bottom of Funnel)

The Companion nurtures prospects from first contact to close. It tracks a **temperature** (0–100) for each prospect and selects the right message persona automatically.

| Temperature | Mode | Persona |
|---|---|---|
| 10 (initial) | `nurture` | Educator — introduce value, no pressure |
| 0–29 | `recovery` | Re-engager — re-spark cold leads, no hard sell |
| 30–74 | `sales` | Consultant — qualify, show fit, build trust |
| 75–100 | `closing` | Closer — urgency, social proof, clear CTA |

New prospects start in `nurture` mode (temperature 10) until their first positive signal.
Temperature transitions: ≥75 → closing · ≥30 → sales · <30 → recovery

---

### Tool: `signalpipe_score_signal`
Score arbitrary text against a product profile — the same scoring engine the scout runs on RSS feeds, exposed for any channel.

**When to call:** User pastes an email, forwarded DM, Slack thread, LinkedIn message, transcript snippet, or any text and asks "is this a real buying signal?" or "is this person interested?". Also use it as a triage step before `signalpipe_track_prospect` when you're not sure the signal is genuine.

**SignalPipe never touches the source platform.** You (the host agent) read the content with your other plugins; this tool just classifies the text. The scoring is the exact same pipeline the scout uses on Reddit/HN — embedding similarity to product anchors, urgency / specificity / keyword-density sub-scores, competitor detection, and sarcasm gate. Note: the per-station RL weight (which the scout multiplies into scores from a specific feed) does NOT apply to score_signal calls — there is no "source station" for ad-hoc text from Gmail, Slack, etc., so the raw scoring engine is used directly.

**Parameters:**
- `text` — content to score (truncated server-side to 4000 chars)
- `product_id` — from `signalpipe_get_products`. Same text scores differently against different products
- `source_hint` (optional) — channel label (`gmail` | `slack` | `discord` | `telegram` | `linkedin` | `whatsapp` | `twitter` | `reddit` | …). Affects drafting tone, not the score

**Returns:**
- `score` — 0–100 weighted score (after RL multiplier, clamped)
- `content_score` — pre-RL content score (honest about what's in the text)
- `classification` — `buying_intent` · `borderline` · `competitor_mention` · `noise`
- `role` — `closer` (highest-intent) · `advisor` (mid-intent) · `educator` (early-stage)
- `sub_scores` — `urgency`, `specificity`, `keyword_density` for explainability
- `competitor_match`, `competitor_name`, `competitor_intent` — competitor detection + intent (complaining / replacing / comparing / neutral)
- `sarcastic` — boolean; sarcastic text scores 0 regardless of surface signal
- `drafting_context` — only present when score ≥ 40 and not sarcastic; contains product info, signal info, and tone instructions for client-side drafting

**When to use this vs `signalpipe_track_prospect`:**
- `score_signal` = does this **text** contain a buying signal? Pure classification, no state change
- `track_prospect` = this **person** took an action, update their temperature. Writes to the pipeline

Many flows use both: score the inbound text first, then track the prospect if the signal is real.

---

### Tool: `signalpipe_track_prospect`
Log a signal from a prospect and update their temperature.

**When to call:** Any time a prospect takes an action — replies, ghosts, asks about price, books a demo, etc. Creates the prospect automatically if they are new.

**Parameters:**
- `handle` — Twitter handle, Reddit username, email, etc.
- `channel` — `twitter` | `reddit_dm` | `whatsapp` | `telegram` | `email` | `discord`
- `signal` — what happened:
  - **Strong positive:** `booked_demo` | `asked_pricing`
  - **Positive:** `viewed_content` | `replied` | `clicked_link`
  - **Strong negative:** `not_interested` | `bad_timing` | `ghosted_7_days`
  - **Negative:** `too_expensive` | `competitor` | `ghosted_3_days` | `no_time`
  - **Neutral:** `not_decision_maker`
- `product_id` (optional) — from `signalpipe_get_products`
- `mission_id` (optional) — if this prospect came from a Mantidae mission

**Returns:** New temperature, mode, and recommended follow-up timing.

---

### Tool: `signalpipe_get_message`
Generate the next outreach message for a prospect.

**When to call:** User asks "what should I say to @handle", "generate a follow-up", "write me a message for this prospect".

**The message is:**
- LLM-generated, natural, human-sounding
- Value-first, no hard sell unless in closing mode
- Under 280 characters (Twitter-safe)
- Tailored to the prospect's current temperature, mode, and objection history

**Parameters:**
- `prospect_id` — returned by `signalpipe_track_prospect`

**After getting the message:** Always present it to the user for review before they send it. Never send autonomously.

---

### Tool: `signalpipe_get_pipeline`
Get the full prospect pipeline sorted by temperature.

**When to call:** User asks "how is my pipeline", "who should I follow up with", "show me my hot prospects", "pipeline summary".

**Returns:** All prospects sorted hottest first, plus counts per mode (nurture / sales / closing / recovery).

---

## Subsystem 3 — Sender (Execution)

The Sender is the v4 "send" half. The brain scores, drafts, and approves missions; the Sender holds a live stream open to the brain, receives the missions it has already approved, and posts them on Reddit using the **operator's OWN** credentials. It never scores, drafts, or stores anything — it only sends.

**Scope:** Reddit only (`reddit_comment` and `reddit_dm`). `twitter_reply` missions are skipped here and left for the standalone `signalpipe-daemon`. `manual` missions are always skipped — the operator sends those by hand.

**Setup:** the Sender needs a Reddit "script" app on the **sending** account, supplied via optional environment variables (see Environment Variables below). If they aren't set, the Sender stays idle and the rest of the plugin works normally. These credentials stay on the operator's machine and are **never** sent to SignalPipe.

**Safety:** the brain only ever streams *approved* missions, so nothing sends without prior human approval. Within a running session each mission is posted at most once — a dropped connection is always safe to recover from. Daily caps pace sending; a capped mission is *skipped* (stays queued for after the next local-midnight reset), not failed.

### Tool: `signalpipe_start_sender`
Start the background Reddit sender.

**When to call:** User says "start sending", "turn on the sender", "go live", "start posting approved replies".

**Before calling:** Confirm with the user before starting a **live** (non-dry-run) sender — it will post to Reddit. Suggest a `dry_run` first to confirm the stream connects and missions arrive.

**Parameters:**
- `dry_run` (optional) — log intended sends without posting to Reddit or acking the brain. Default false.

**After calling:** The loop runs in the background until `signalpipe_stop_sender` or a gateway restart. Tell the user it's running and offer `signalpipe_sender_status` to check on it.

---

### Tool: `signalpipe_stop_sender`
Stop the background Reddit sender.

**When to call:** User says "stop sending", "turn off the sender", "pause posting".

**Effect:** Closes the mission stream cleanly. Missions already posted are unaffected; unsent approved missions stay queued on the brain and deliver next time the sender runs. Stopping and restarting is always safe.

**No parameters.**

---

### Tool: `signalpipe_sender_status`
Report the sender state.

**When to call:** User asks "is the sender running", "how many has it sent", "is it connected", or right after starting it to confirm it connected.

**Returns:** A `local` block (running, connected, paused, sent / failed / skipped counts this session, last event, last error) and a `brain` block (queue depth, auto-fire threshold, version). Present the local loop state first (running? connected? counts), then the brain queue depth.

**No parameters.**

---

## Full Workflow Examples

### New lead comes in from Mantidae
```
1. signalpipe_get_missions → show user pending leads
2. User reviews each → approve or reject
3. signalpipe_approve_mission (with optional edited draft)
4. signalpipe_track_prospect (handle=..., signal="replied", mission_id=...)
   → prospect is now in the Companion system
5. signalpipe_get_message → generate warm first follow-up
6. Present message to user for review
```

### User wants to follow up on their pipeline
```
1. signalpipe_get_pipeline → show sorted prospects
2. User picks a prospect to message
3. signalpipe_get_message → generate context-aware message
4. User reviews and sends
5. signalpipe_track_prospect → log the outcome (replied, ghosted, etc.)
```

### User adds a new product
```
1. signalpipe_add_product → fill all fields, anchor sentences are key
2. signalpipe_reload_products → activate immediately
3. signalpipe_add_station → add a Reddit or HN feed
4. signalpipe_scout_now → run first scan immediately
5. signalpipe_get_missions → review first batch of leads
```

### User wants the plugin to auto-send approved Reddit missions
```
1. (one-time) Set REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD in the environment
2. signalpipe_start_sender (dry_run=true) → confirm it connects and missions arrive
3. signalpipe_sender_status → verify connected=true
4. signalpipe_stop_sender, then signalpipe_start_sender → go live
5. signalpipe_sender_status → watch sent / failed / skipped counts
```

---

## Backend Lifecycle

When SignalPipe loads (i.e., when OpenClaw starts with the plugin installed), the plugin registers its 20 tools and connects to the SignalPipe managed backend. You will see this in the OpenClaw logs:

```
🦐 SignalPipe ONLINE
   Backend : https://api.signalpipe.io
   Tools   : 20 registered (Mantidae + Nurture Engine + Sender)
   Status  : connected
```

The backend polls every 60 seconds automatically. It scores signals, drafts replies, and queues approved missions for outreach execution — all on managed infrastructure. Your OpenClaw LLM key stays inside OpenClaw and is never shared with SignalPipe.

---

## Environment Variables

Set before starting the OpenClaw gateway:

| Variable | Required | Description |
|---|---|---|
| `SIGNALPIPE_API_URL` | Yes | URL of your SignalPipe backend — provided at signup |
| `SIGNALPIPE_OPERATOR_KEY` | Yes | Your secret operator key — provided at signup from signalpipe.io |
| `REDDIT_CLIENT_ID` | Sender only | Reddit "script" app client id (sending account) |
| `REDDIT_CLIENT_SECRET` | Sender only | Reddit "script" app secret |
| `REDDIT_USERNAME` | Sender only | Reddit username of the sending account |
| `REDDIT_PASSWORD` | Sender only | Reddit password of the sending account |
| `REDDIT_USER_AGENT` | No | Defaults to `signalpipe-plugin/2.0` |
| `MAX_REDDIT_COMMENTS_PER_DAY` | No | Daily comment cap. Default 15 |
| `MAX_REDDIT_DMS_PER_DAY` | No | Daily DM cap. Default 5 |

The two `SIGNALPIPE_*` vars are all the plugin needs for scoring, drafting, and review — your OpenClaw LLM key stays inside OpenClaw and is never shared with SignalPipe. The `REDDIT_*` vars are **optional** and only needed to run the in-plugin Sender (Subsystem 3); they stay on your machine and are **never** sent to SignalPipe. MCP-only operators can ignore them entirely.

---

## Error Recovery

If a tool call returns an error, follow this decision tree before doing anything else:

### Any tool returns HTTP 401 / "Unauthorized"
- `SIGNALPIPE_OPERATOR_KEY` is wrong or not set. Tell the user: *"Authentication failed — please check SIGNALPIPE_OPERATOR_KEY is set correctly and matches the backend OPERATOR_KEY."*
- Do not retry until the user confirms they've fixed the key.

### Any tool returns HTTP 404
- The backend URL is wrong or the server is down. Tell the user: *"Could not reach the SignalPipe backend. Please check SIGNALPIPE_API_URL is correct and the backend is running."*
- Suggest: verify the URL returns `{"status":"online"}` at `/health`.

### Any tool returns HTTP 429 / "rate limit"
- The backend rate limiter triggered (>120 requests/min). Wait 60 seconds, then retry once. If it happens again, tell the user and stop.

### `signalpipe_get_missions` returns empty array
- This is normal — no leads yet. Do not tell the user something is broken.
- Say: *"No pending leads right now. The system scouts every 10 minutes. You can trigger an immediate scan with `signalpipe_scout_now`."*

### `signalpipe_add_product` fails with HTTP 400
- A required field is missing. The error message will name the field. Ask the user for the missing value and retry.
- Required fields: `name`, `anchor_sentences`.

### `signalpipe_get_message` returns the fallback message ("Just following up…")
- This means the LLM call failed silently on the backend. The fallback message is intentionally generic.
- Tell the user: *"The AI couldn't generate a custom message — this is a fallback. You can send it as-is or write your own."*

### Backend unreachable (network timeout / connection refused)
- Do not loop-retry. Tell the user once: *"SignalPipe backend is not responding. Please check your backend deployment status at api.signalpipe.io/health."*

---

## Guiding Principles

- **Always get human approval before sending messages.** Never call approve or send autonomously.
- **Log every signal.** The more you track with `signalpipe_track_prospect`, the smarter the temperature model gets.
- **Quality over volume.** Reject bad leads — it makes the RL scoring better.
- **Anchor sentences are the product.** When adding a product, spend time on those buyer phrases.
- **Never retry auth errors in a loop.** A 401 will keep returning 401 until the key is fixed — looping wastes quota.
