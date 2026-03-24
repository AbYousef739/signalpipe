# SignalPipe — Skill Guide for OpenClaw Agents

SignalPipe gives you a full agentic sales pipeline:
**signal detection → human review → prospect nurturing → pipeline visibility.**

Two subsystems, ten tools. Use them in sequence.

---

## Subsystem 1 — Mantidae (Top of Funnel)

Mantidae scouts the web for buying signals and queues them as missions for review.

### Tool: `signalpipe_get_missions`
Fetch all pending missions awaiting human approval.

**When to call:** User asks "show me my leads", "what needs review", "check the pipeline".

**Returns:** Array of missions, each with:
- `id` — mission ID (use for approve/reject)
- `product_name` — which product this lead is for
- `signal_score` — 0–100 buying intent score (cosine similarity × 100, scaled by RL weight)
- `competitor_flag` — true if a competitor was mentioned
- `channel` — where to reach them (`twitter` | `reddit_dm` | `email` | etc.)
- `handle` — prospect's username/email
- `lead_snippet` — the text that triggered the signal
- `ai_draft` — AI-generated reply, ready to send

**Example workflow:**
```
User: "Show me today's leads"
→ Call signalpipe_get_missions
→ Present each mission: score, handle, snippet, draft
→ Ask user to approve or reject each one
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
Reject a mission — it was not a real buying signal.

**When to call:** User says "skip", "not relevant", "bad lead", "reject".

**Effect:** Nudges the RL weight down so similar leads score lower in future.

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
- `platform` — `rss` | `hn` | `reddit` | `twitter_search`
- `rss_url` — full feed URL

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
| 0–29 | `recovery` | Re-engager — re-spark cold leads, no hard sell |
| 30–74 | `sales` | Consultant — qualify, show fit, build trust |
| 75–100 | `closing` | Closer — urgency, social proof, clear CTA |

New prospects start in `nurture` mode (temperature 10) until their first positive signal.
Temperature transitions: ≥75 → closing · ≥50 → sales · <30 → recovery

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

## Environment Variables

Set before starting the OpenClaw gateway:

| Variable | Description |
|---|---|
| `SIGNALPIPE_API_URL` | URL of your SignalPipe backend (e.g., `https://your-app.up.railway.app`) |
| `SIGNALPIPE_OPERATOR_KEY` | Secret operator key set on your backend |

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
- Do not loop-retry. Tell the user once: *"SignalPipe backend is not responding. Please check Railway deployment status."*

---

## Guiding Principles

- **Always get human approval before sending messages.** Never call approve or send autonomously.
- **Log every signal.** The more you track with `signalpipe_track_prospect`, the smarter the temperature model gets.
- **Quality over volume.** Reject bad leads — it makes the RL scoring better.
- **Anchor sentences are the product.** When adding a product, spend time on those buyer phrases.
- **Never retry auth errors in a loop.** A 401 will keep returning 401 until the key is fixed — looping wastes quota.
