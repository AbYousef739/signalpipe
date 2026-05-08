---
name: signalpipe
description: Agentic sales pipeline — detects buying-intent signals on Reddit, HN, and RSS feeds, drafts replies (server-side or client-side via host LLM), and nurtures prospects from cold to closed.
version: 1.5.0
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
**signal detection → human review → prospect nurturing → pipeline visibility.**

Two subsystems, sixteen tools. Use them in sequence.

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

**Effect:** Sets the mission status to rejected and nudges the RL weight down by a per-reason amount. Accuracy directly improves how the system learns.

| Reason | Penalty | When to pick |
|---|---|---|
| `spam` | -0.04 | Bot, promoted, automated post |
| `not_relevant` | -0.03 | Wrong audience or topic |
| `wrong_product` | -0.01 | Real signal, wrong product matched |
| `too_vague` | -0.02 | Signal too weak to act on |
| `sarcasm` | -0.01 | Ironic / venting, not a real buyer |
| `already_customer` | 0.00 | They bought — no penalty |
| `no_reason` | -0.02 | Default if you have no opinion |

**Parameters:**
- `mission_id` (required)
- `rejection_reason` (optional) — pick the closest reason from the table. The reason accumulates into `products.rejection_stats` for analytics.

---

### Tool: `signalpipe_delete_mission`
Hard-delete a mission row — silent queue cleanup, no learning signal.

**When to call:** User says "just delete this", "clear it", "I don't care, get rid of it" — or when you want to clear duplicates / accidental scrapes that the RL loop should not learn from.

**Effect:** Removes the row entirely. The source feed's scoring weight is untouched.

**When to prefer `signalpipe_reject_mission` instead:** Any time you can categorise WHY the lead was bad. Reject teaches the RL loop with a per-reason penalty; delete throws away the learning signal. Default to reject when in doubt.

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

---

## Backend Lifecycle

When SignalPipe loads (i.e., when OpenClaw starts with the plugin installed), the plugin registers its 16 tools and connects to the SignalPipe managed backend. You will see this in the OpenClaw logs:

```
🦐 SignalPipe ONLINE
   Backend : https://api.signalpipe.io
   Tools   : 16 registered (Mantidae + Nurture Engine)
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

That's it for the plugin. All other configuration (LLM keys, outreach credentials, rate limits) is set on the SignalPipe backend — not in OpenClaw. Your OpenClaw LLM key stays inside OpenClaw.

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
