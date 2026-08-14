# Kapture Collections Voicebot — "Mugilan"

An outbound voice AI agent that calls a customer about an overdue loan EMI,
verifies their identity first, tells them the amount only after verification,
and either collects a Promise-to-Pay or routes the call correctly (already
paid / dispute / do-not-call / wrong person).

This README is written so a complete beginner can follow it. Nothing is
assumed. Every tool used is explained: what it is, why it's here, and what
you could use instead.

---

## 1. Python or Node.js — which one should you use, and why

**Short answer: use Node.js.** Here's the honest comparison so you understand
the decision instead of just trusting it:

| | Node.js (Express) | Python (FastAPI) |
|---|---|---|
| Vapi's own docs & examples | Mostly Node.js | Fewer official examples |
| Deploying free webhook (Render/Vercel/ngrok) | Very simple, 1-click friendly | Also fine, slightly more config |
| JSON handling (Vapi sends/expects JSON) | Native — JS objects ARE JSON | Needs `json` import + dict conversion |
| Learning curve if you're new | Simpler syntax for this exact task | Great if you already know Python |
| Speed to build in 1 day | Faster for this specific job | Slightly slower setup |

Both would work completely fine. This project is built in **Node.js**
because the webhook we need to build is small, JSON-only, and Node
(`Express`) is the path of least friction for exactly this kind of task. If
you already know Python well, you can port `server.js` line-for-line into a
FastAPI app — the logic is identical, only the syntax changes.

---

## 2. What each tool/service is, and why it's in this project

Think of the call like a relay race. Each tool does one leg:

```
Phone Call → Vapi → Deepgram (hears you) → GPT-4o (thinks) → ElevenLabs (speaks) → Phone Call
                                    ↓
                         Your webhook server (does actions: verify identity, log payment)
```

| Tool | What it actually is | Why it's used here | Alternative you could swap in |
|---|---|---|---|
| **Vapi.ai** | The platform that connects phone calls to AI models. It's the "glue" — you don't have to build telephony, streaming audio, or interruption-handling yourself. | It's free-tier friendly, made exactly for this (voice agents + tool calling), and has a simple dashboard. | Retell AI, Bland AI, or building raw with Twilio + your own STT/LLM/TTS pipeline (much harder, not needed for a 1-day project). |
| **Soniox (STT v5)** | Speech-to-Text — converts the customer's spoken audio into text in real time. This project uses Vapi's built-in Soniox transcriber (automatic language detection). | No separate API key needed since it's bundled into Vapi; fast enough (~410ms) for a real-time call. | Deepgram Nova-2, Google STT, Whisper (via API), AssemblyAI — any of these can be swapped in from Vapi's Transcriber tab with no prompt/tool changes needed. |
| **GPT-4.1** (via OpenAI, through Vapi) | The "brain" — reads the transcript, decides what to say next, and decides when to call a tool (like `verify_customer`). | Reliable at following strict state rules ("don't reveal debt before verification") when given a clear system prompt. | GPT-4o / GPT-4o-mini (faster, cheaper), Claude 3.5/3.7 Sonnet (also supported by Vapi), Gemini. |
| **Elliot (Vapi's built-in voice)** | Text-to-Speech — turns the AI's text reply into spoken audio. This project uses Vapi's own bundled voice rather than a separate provider. | No separate API key needed; good enough humanness score (~92) for a demo without extra setup. | ElevenLabs, Cartesia, Google TTS, Azure TTS, PlayHT — any of these can be swapped in from Vapi's Voice tab. |
| **ngrok** | A tunnel that takes something running on your own laptop (`localhost:3000`) and gives it a public internet address Vapi can reach. | You're not deploying to a real server yet — ngrok is the fastest way to test locally. | Render.com or Vercel (free, permanent URL — no need to keep your laptop on). |
| **Express (Node.js)** | A small web framework for building the webhook server that receives "tool call" requests from Vapi and returns mock answers. | Minimal boilerplate, perfect for 4–5 simple endpoints. | FastAPI (Python), Flask (Python), plain Node `http` module. |

**In one sentence:** Vapi runs the call and the conversation; Deepgram
converts speech→text; GPT-4o decides what to say and when to trigger an
action; ElevenLabs converts text→speech; and your own small server (this
repo's `mock-server/`) is what actually "does" verify-customer,
log-promise-to-pay, etc. — Vapi just calls it like an API.

---

## 3. Environment setup — step by step (spoon-fed)

### Step 3.1 — Install Node.js
1. Go to https://nodejs.org
2. Download the **LTS** version (v18 or newer).
3. Install it (Next → Next → Finish, defaults are fine).
4. Confirm it worked — open your terminal (Command Prompt / Terminal / PowerShell) and type:
   ```
   node -v
   npm -v
   ```
   You should see version numbers like `v20.11.0` and `10.2.4`. If you see
   "command not found," restart your terminal or reinstall.

### Step 3.2 — Get the project files
- Copy the whole `kapture-collections-voicebot` folder (this project) onto your computer.
- Open a terminal **inside** the `mock-server` folder:
  ```
  cd kapture-collections-voicebot/mock-server
  ```

### Step 3.3 — Install dependencies
```
npm install
```
This reads `package.json` and downloads the 2 small libraries (`express`,
`dotenv`) the server needs. You'll see a new `node_modules` folder appear —
that's normal, don't touch it.

### Step 3.4 — Run the server locally
```
node server.js
```
You should see:
```
Kapture Mock Collections Webhook Server (Mugilan) running on port 3000
```
Leave this terminal window open and running.

### Step 3.5 — Install ngrok (to expose your local server to the internet)
1. Go to https://ngrok.com and sign up (free).
2. Download ngrok for your OS and follow their "install + authenticate" steps
   (they give you a one-line command like `ngrok config add-authtoken XXXX`).
3. In a **new** terminal window (keep the server running in the first one), type:
   ```
   ngrok http 3000
   ```
4. ngrok will print something like:
   ```
   Forwarding   https://a1b2-49-207-xxx.ngrok-free.app -> http://localhost:3000
   ```
   Copy that `https://...ngrok-free.app` URL. This is your **public webhook base URL**.
   Your actual webhook endpoint will be:
   ```
   https://a1b2-49-207-xxx.ngrok-free.app/webhook
   ```

   > **Alternative:** instead of ngrok (which stops when you close your
   > laptop), you can deploy `mock-server/` for free on **Render.com**
   > (Web Service → connect repo → it gives you a permanent URL). Good for
   > final submission; ngrok is good for quick local testing.

### Step 3.6 — Create your Vapi account
1. Go to https://vapi.ai → Sign up (free tier gives trial credits).
2. On the dashboard, go to **Assistants → Create Assistant → Blank Template**.

### Step 3.7 — Configure the Assistant in Vapi
Fill in these sections in the Vapi dashboard:

- **Transcriber (STT):** Provider = Deepgram, Model = `nova-2`, Language = `en` (or `multi` for Hindi/English switching).
- **Model (LLM):** Provider = OpenAI, Model = `gpt-4o` (or `gpt-4o-mini` to save credits), Temperature = `0.1` (low = strict, predictable, less improvisation — important for compliance).
- **Voice (TTS):** Provider = ElevenLabs or Cartesia, pick a natural-sounding voice.
- **First Message:** paste the first line from `vapi/system_prompt.txt` (see Step 3.9).
- **System Prompt:** paste the **entire contents** of `vapi/system_prompt.txt`.

### Step 3.8 — Register your tools (functions) in Vapi
1. In the Assistant editor, go to the **Tools** (or **Functions**) tab.
2. For each tool in `vapi/tool_definitions.json`, click **Add Tool → Function**,
   and paste in that tool's schema (name, description, parameters).
3. For the **Server URL** of each tool, paste your ngrok webhook URL:
   ```
   https://a1b2-49-207-xxx.ngrok-free.app/webhook
   ```
   All tools point to the *same* URL — the server code figures out which
   tool was called from the request body.

### Step 3.9 — Paste in the system prompt
- Open `vapi/system_prompt.txt`.
- Copy everything.
- Paste it into the Vapi Assistant's **System Prompt** box.
- This file is already written for the agent named **Mugilan** and customer **Rahul Sharma**.

### Step 3.10 — Test it
1. In Vapi dashboard, click **Talk to Assistant** (web call — uses your
   laptop mic/speaker, no phone number needed).
2. Try the **happy path**: confirm you're Rahul → give code `1234` or `1995`
   (the mock server accepts these) → Mugilan reveals the amount → say
   "I'll pay this Friday."
3. Try an **edge case**: after verifying, say "I already paid this
   yesterday via UPI."
4. Watch your `node server.js` terminal — you'll see `[Tool Call Received]`
   logs proving the webhook is actually being hit.

### Step 3.11 — Record your demo
- Use **Loom** (https://loom.com, free) or **OBS Studio** (free, open source)
  to screen-record 2–4 minutes: one happy-path call, one edge case.

---

## 4. Project structure — what's in this folder and why

```
kapture-collections-voicebot/
├── README.md                    ← you are here
├── docs/
│   └── HLD_Document.md          ← the engineering design doc (Task 1)
├── vapi/
│   ├── system_prompt.txt        ← paste this into Vapi's System Prompt box
│   └── tool_definitions.json    ← paste these into Vapi's Tools tab
├── mock-server/
│   ├── package.json             ← lists the 2 dependencies (express, dotenv)
│   ├── server.js                ← the actual webhook server (run this)
│   └── .env.example             ← copy to .env if you add real secrets later
└── tests/
    └── test_cases.json          ← example test scenarios to prove compliance
```

- **`docs/HLD_Document.md`** — hand this to an engineer; it explains the
  architecture, state machine, latency budget, and compliance rules.
- **`vapi/`** — everything that lives *inside* Vapi's dashboard, kept here
  as text files so you have a version-controlled copy.
- **`mock-server/`** — the only thing you actually *run*. It pretends to be
  Kapture Finance's real backend (real one would check an actual database).
- **`tests/`** — proof you thought about edge cases, not just the happy path.

---

## 5. How the conversation actually works (plain English)

1. **Mugilan greets the customer** and confirms it's the right person — *no
   mention of money yet.*
2. **Mugilan asks for a verification code** (last 4 digits of PAN, or birth year).
3. Mugilan calls the `verify_customer` tool → your server checks it → only
   if it comes back `verified: true` does Mugilan continue.
   - This check is a **hard rule in the prompt**, not a suggestion — the
     system prompt explicitly forbids saying words like "loan," "EMI," or
     "overdue" before this point.
4. Once verified, Mugilan reveals the amount (₹8,499, 12 days overdue) and
   asks about payment.
5. Depending on what the customer says, Mugilan branches:
   - **Will pay** → calls `log_promise_to_pay` then `send_payment_link`.
   - **Already paid** → calls `mark_disposition(status="ALREADY_PAID")`.
   - **Can't pay / hardship** → calls `escalate_to_agent`.
   - **Disputes the amount** → calls `escalate_to_agent(reason="DISPUTE")`.
   - **Says stop calling** → calls `mark_disposition(status="DO_NOT_CALL")` and ends immediately.
6. Every call ends with a disposition logged — nothing just "hangs" silently.

---

## 6. Design choices — why these decisions were made

- **Temperature 0.1** on the LLM: lower temperature = more predictable,
  rule-following behaviour. A collections call is not the place for a
  creative AI.
- **State-enforced auth, not prompt-enforced:** the prompt tells the model
  it *cannot* proceed until the `verify_customer` tool actually returns
  `verified: true` — the model can't just decide on its own that someone
  "sounds like" Rahul.
- **PII masking in logs:** the design doc (`docs/HLD_Document.md`) specifies
  logs should show `Rahul S****` rather than the full name, and never log
  the raw verification code.
- **Mock endpoints, not a real database:** for a 1-day assignment, the
  server just returns realistic fake JSON. In production, `verify_customer`
  would query a real customer database over a secure internal API.

---

## 7. Common problems & how to debug them

| Problem | Likely cause | Fix |
|---|---|---|
| Vapi says "tool call failed" | ngrok URL changed (it changes every time you restart ngrok on the free plan) | Update the Server URL in Vapi's Tools tab with the new ngrok URL |
| Server crashes on start | Dependencies not installed | Run `npm install` again inside `mock-server/` |
| Mugilan reveals the amount before verifying | System prompt not fully pasted, or wrong temperature | Re-paste the full `system_prompt.txt`; confirm temperature is low (0.1–0.3) |
| No `[Tool Call Received]` logs appear | Vapi's Tool "Server URL" doesn't match your current ngrok URL, or `/webhook` path missing | Double check the full URL ends in `/webhook` |
| ngrok URL stops working after a while | Free ngrok sessions expire / restart | Restart `ngrok http 3000`, copy the new URL, update Vapi tools again |

---

## 8. What you'd improve with more time

- Move from mock endpoints to a real customer database with proper auth (API keys, not open webhook).
- Add real SMS/WhatsApp sending (e.g., via Twilio or Gupshup) instead of a mocked `send_payment_link`.
- Add a human-agent handoff mechanism (warm transfer) for `escalate_to_agent`.
- Add proper structured logging + a dashboard for the observability metrics listed in the HLD (containment rate, PTP rate, etc.).
- Add automated regression testing that replays `tests/test_cases.json` against a real Vapi test call.
