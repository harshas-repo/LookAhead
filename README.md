<div align="center">

# LookAhead

**Prepare for what's next.**

A calm, guided decision-rehearsal app for people preparing for treatment-related
hair loss — record today's hair, explore a few supported options, rehearse
"what if" scenarios, and leave with a printable **Plan A / Plan B** you own.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-186%20passing-brightgreen)](#testing)

</div>

> **Not a medical device.** LookAhead offers no diagnosis, prognosis, or medical
> advice. Hairstyle previews are a planning aid, not a promise about the future.

---

## Contents

- [Overview](#overview)
- [The journey](#the-journey)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Provider modes: mock vs. live](#provider-modes-mock-vs-live)
- [Private Preview access](#private-preview-access)
- [Architecture](#architecture)
- [API surface](#api-surface)
- [The hairstyle VTO limitation](#the-hairstyle-vto-limitation)
- [Preview budget, reuse & privacy](#preview-budget-reuse--privacy)
- [Scripts](#scripts)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Design docs](#design-docs)
- [License](#license)

---

## Overview

LookAhead helps someone preparing for treatment-related hair loss think ahead —
without predicting how they will look. Instead of a crystal ball, it offers a
structured, respectful rehearsal: capture the hair in the photo **today**, explore
a small set of real, supported options, weigh "what if" scenarios, and produce a
plan they can print and take to their care team.

Three cooperating, **deterministic** components drive the experience — there is
**no LLM**, so the same state always yields the same next action:

1. **Decision engine** — the source of truth for stages, transitions, completion,
   and final plan assembly. Pure and side-effect free.
2. **Guide** — a bounded decision-support loop on top of the engine
   (observe → apply rules → select → validate → present → process response →
   persist → reassess). It never invents options, overrides a limit, or pushes an
   illegal transition.
3. **Scenario library** — gentle "what if" exercises, each of which always offers
   an explicit *"Leave this undecided for now"* path.

---

## The journey

A finite-state machine with four screens:

| Route       | Screen   | Purpose                                                                   |
| ----------- | -------- | ------------------------------------------------------------------------- |
| `/`         | Welcome  | Framing, reassurance, and consent to begin.                               |
| `/prepare`  | Prepare  | Priorities → photo (upload **or** camera) → Hair Record (analysis).       |
| `/rehearse` | Rehearse | Explore a small curated set of options; generate hairstyle previews.      |
| `/plan`     | Plan     | Plan A, scenario rehearsal, Plan B, care-team questions, printable sheet. |

---

## Features

- **Honest by design** — describes the hair in the photo *today*; never a
  prediction. Every result carries a mock/live badge, so a simulated preview is
  never silently presented as real.
- **Real previews, real limits** — hairstyle VTO bound to *verified* provider
  template ids; covering options (wig / scarf / hat / no covering) are presented
  as respectful text, not fake renders.
- **Anonymous, private sessions** — no accounts; an unpredictable ownership token
  authorizes each session; photos require explicit consent; **Delete everything**
  wipes the session and all stored images from disk.
- **Credit-safe** — previews sit behind explicit buttons, identical renders are
  reused (never re-charged), in-flight tasks aren't duplicated, and failures are
  never auto-retried.
- **Printable Plan A / Plan B** — a clean, exportable summary plus questions for
  the care team.
- **Private Preview access** — a lightweight pass gate keeps the shared YouCam API
  allocation reserved for judges (no per-user API keys).

---

## Tech stack

- **Next.js 14** (App Router) · **React 18** · **TypeScript** (strict)
- **Tailwind CSS** with a custom warm, editorial wellness design system
- **Zod** for request validation and constrained guide/action schemas
- **File-based persistence** — durable JSON sessions + photos on disk (no
  browser-memory-only state)
- **Vitest** for unit tests
- **YouCam / Perfect Corp** provider adapters (Hair Length / Density / Type
  Detection + Hairstyle VTO), isolated behind normalized interfaces

There is **no separate backend server** — all server logic lives in Next.js App
Router route handlers.

---

## Getting started

Requires **Node.js 18.17+** (Node 20+ recommended).

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file (the example holds names only — fill in values)
cp .env.example .env.local          # Windows PowerShell: Copy-Item .env.example .env.local

# 3. Run in mock mode (no API key needed, zero credits)
npm run dev
```

Open <http://localhost:3000>. With the default `.env.example` values
(`PROVIDER_MODE=mock`, no `YOUCAM_API_KEY`), the app runs end-to-end on
deterministic simulated adapters — clearly labelled in the UI.

> **Judging the deployed preview?** You don't need a YouCam key. The deployed app
> runs on the platform's own server-side key and is unlocked with a lightweight
> **Private Preview** access pass. See [Private Preview access](#private-preview-access)
> and [`TESTING.md`](TESTING.md).

> **Camera capture needs a secure context.** `getUserMedia` only works over
> **HTTPS** or `http://localhost`. On a plain-HTTP LAN address the camera option is
> hidden and the app gracefully falls back to file upload.

---

## Environment variables

Every variable is **server-side only** — none is exposed to the client bundle. See
[`.env.example`](.env.example) for the canonical, secret-free list.

| Variable                   | Default                           | Description                                                                     |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `PROVIDER_MODE`            | `mock`                            | `mock` = simulated adapters; `live` = real YouCam calls (needs a key).           |
| `YOUCAM_API_KEY`           | *(empty)*                         | Server-side Bearer token for **all** live YouCam calls. Never sent to the browser. |
| `LOOKAHEAD_ACCESS_CODE`    | *(empty)*                         | Secret **Private Preview** pass. When set, live calls require it; empty = gate off (local dev). Never exposed to the browser. |
| `YOUCAM_BASE_URL`          | `https://yce-api-01.makeupar.com` | Provider base URL.                                                              |
| `YOUCAM_HAIRSTYLE_VERSION` | `v2.1`                            | `v2.1` (hair-transfer) or `v2.0` (hair-style), per account provisioning.         |
| `MAX_PREVIEWS_PER_SESSION` | `0`                               | Server-enforced preview budget per session. `0` = unlimited; set a positive cap as a cost escape hatch. |
| `TASK_POLL_INTERVAL_MS`    | `1000`                            | Poll interval for async provider tasks.                                         |
| `TASK_POLL_TIMEOUT_MS`     | `120000`                          | Poll timeout for async provider tasks.                                          |
| `SESSION_TTL_MS`           | `604800000` (7 days)              | Anonymous session lifetime.                                                     |
| `DATA_DIR`                 | `.data`                           | Local runtime data dir (session JSON + stored photos). Git-ignored.             |

> **Never commit secrets.** `.env`, `.env*.local`, and `.data/` are git-ignored.
> There are **no hardcoded fallback secrets** in the codebase.

---

## Provider modes: mock vs. live

The mode is decided **server-side** by `getConfig().youcam.liveReady`, which is
true only when `PROVIDER_MODE === "live"` **and** a server `YOUCAM_API_KEY` is
present. The key never reaches the browser.

- **Mock (default):** deterministic adapters, zero credits. The hairstyle VTO
  returns a clearly-labelled **SVG placeholder** ("Simulated preview — mock mode /
  Not a prediction of future appearance"). One template (`mock-buzz`) deliberately
  reproduces the `error_hair_too_short` flow so it can be demonstrated and tested.
- **Live:** real YouCam Hair Length / Density / Type Detection + Hairstyle VTO
  through the same normalized interfaces. Provider result URLs expire quickly, so
  outputs are re-hosted to private local storage on completion.

Swapping providers only touches `src/lib/providers/`; the rest of the app depends
on the normalized interfaces in `src/lib/providers/types.ts`.

---

## Private Preview access

The deployed app runs on **one shared YouCam key held on the server**
(`YOUCAM_API_KEY`). Judges and testers **do not need their own key**. Instead, live
functionality sits behind a lightweight **Private Preview** pass — *not* a login,
account, or password.

**How it works**

1. A visitor can browse LookAhead freely. When `LOOKAHEAD_ACCESS_CODE` is set, a
   **Preview Access** control appears in the header (beside *Privacy*); clicking it
   opens a *Private Preview* dialog to enter the pass. The pass is only needed for
   the credit-spending live calls, which keeps the shared YouCam allocation reserved
   for judges rather than open to anyone.
2. The entered pass is sent to `POST /api/access`, which compares it with
   `LOOKAHEAD_ACCESS_CODE` **on the server** (constant-time, rate-limited). The
   expected pass is never sent to the browser.
3. On a match the server sets an **HTTP-only, `SameSite=Lax` (Secure in
   production)** cookie holding a signed token that expires after 7 days. The
   browser stores only this authorization indicator — **never** the YouCam key.
4. Every credit-spending live request (hair analysis, hairstyle previews) then
   flows: browser → LookAhead server (validates the cookie, reads
   `YOUCAM_API_KEY` from the environment) → YouCam → only the result back to the
   browser. Browsing and session creation stay free.

A returning tester with a still-valid cookie continues without re-entering the
pass; normal in-app navigation never re-prompts. An invalid pass shows a generic
*"That access pass isn't valid"* message and never reveals how much was correct.

**Configuring it**

- **Deployed / judging:** set `PROVIDER_MODE=live`, `YOUCAM_API_KEY=<platform key>`,
  and `LOOKAHEAD_ACCESS_CODE=<a long, unguessable pass>`. Share the pass with
  testers through a private channel — never commit it or put it in the README. See
  [`TESTING.md`](TESTING.md) for the judge walkthrough.
- **Local development:** leave `LOOKAHEAD_ACCESS_CODE` empty to disable the gate,
  or set it to exercise the pass flow. `PROVIDER_MODE=mock` needs no key and
  consumes zero credits.

**Credit efficiency.** Live credits are consumed only on **success** and kept to a
minimum: hair analysis is cached per photo and never re-run; an identical
successful preview is reused instead of re-charged; an in-flight preview is not
submitted twice (double-click / multi-tab safe); failures are never auto-retried;
and the uploaded photo's `file_id` is reused across analysis and every preview.

---

## Architecture

```
Browser (client components)
   │  api-client.ts  (fetch wrappers; x-session-token header, ?token= for <img>)
   ▼
App Router API routes  (src/app/api/**)   ← validation, ownership checks, limits
   │
   ├─ Access gate       (src/lib/access.ts)          — pass check + signed cookie
   ├─ Decision engine   (src/lib/decision/engine.ts) — stages, transitions, plan
   ├─ Option catalog    (src/lib/decision/options.ts)— real template ids only
   ├─ Scenarios         (src/lib/decision/scenarios.ts)
   ├─ Limits            (src/lib/decision/limits.ts) — budget + reuse invariants
   ├─ Guide             (src/lib/guide/index.ts)     — deterministic loop
   ├─ Agent             (src/lib/agent/**)           — observe, policy, validate, execute
   ├─ Providers         (src/lib/providers/**)       — youcam (live) | mock
   └─ Store             (src/lib/store/index.ts)     — durable file persistence
```

**Key design decisions**

- **Anonymous sessions with ownership checks.** A session `id` appears in URLs, but
  authorization requires an unpredictable `token` (`randomBytes(32)`, base64url) sent
  via the `x-session-token` header — or `?token=` for `<img>` sources that cannot set
  headers. The token is returned exactly once, at creation.
- **Photos never live in the session record.** Uploaded/normalized images and
  preview outputs are stored as separate files under `DATA_DIR/photos/`; the session
  holds only references.
- **One shared photo pipeline.** Upload *and* camera capture both flow through the
  same client-side normalization (`src/lib/photo.ts`): canvas → **JPEG, long side
  ≤ 1024px**.
- **Async previews with polling.** `POST /previews` creates a task (charging budget
  up front, storing `processing`); `GET /previews/[id]` polls, then re-hosts the
  output — avoiding long-blocking requests and respecting provider URL expiry.
- **Secret-free responses.** Serialization (`src/lib/api/serialize.ts`) strips the
  token, stored paths, and task ids before anything reaches the browser.

---

## API surface

| Method | Route                                           | Purpose                                       |
| ------ | ----------------------------------------------- | --------------------------------------------- |
| GET    | `/api/access`                                   | Private Preview status (required / authorized). |
| POST   | `/api/access`                                   | Validate a pass; set the authorization cookie. |
| POST   | `/api/sessions`                                 | Create a session (returns the token once).     |
| GET    | `/api/sessions/[id]`                            | Read public session.                           |
| PATCH  | `/api/sessions/[id]`                            | Update profile / priorities / consent.         |
| DELETE | `/api/sessions/[id]`                            | Privacy reset — delete session + photos.       |
| POST   | `/api/sessions/[id]/photos`                     | Upload a normalized photo (consent required).  |
| GET    | `/api/sessions/[id]/photos/[photoId]/image`     | Serve a stored photo (private, no-store).      |
| POST   | `/api/sessions/[id]/hair-analysis`              | Run analysis (reuses prior success). 🔒 pass   |
| PATCH  | `/api/sessions/[id]/hair-analysis`              | Confirm / correct / skip the result.           |
| GET    | `/api/hairstyle-templates`                      | Verified template catalog.                     |
| GET    | `/api/sessions/[id]/options`                    | Options + a relevant scenario + budget.        |
| POST   | `/api/sessions/[id]/previews`                   | Create a preview (budget + reuse enforced). 🔒 pass |
| GET    | `/api/sessions/[id]/previews/[previewId]`       | Poll preview status.                           |
| GET    | `/api/sessions/[id]/previews/[previewId]/image` | Serve the re-hosted output.                    |
| POST   | `/api/sessions/[id]/guide`                      | Deterministic guidance for the current stage.  |
| POST   | `/api/sessions/[id]/decisions`                  | Record / update a decision.                    |
| GET    | `/api/sessions/[id]/plan`                       | Assembled printable plan summary.              |
| PATCH  | `/api/sessions/[id]/plan`                       | Set / clear Plan A, Plan B, questions.         |

🔒 = requires a valid Private Preview pass when `LOOKAHEAD_ACCESS_CODE` is set.

---

## The hairstyle VTO limitation

The Hairstyle VTO API **restyles existing hair only** — it cannot render wigs,
scarves, hats, or a shaved/bald head. LookAhead is honest about this:

- **Visualizable options** are bound to *real* template ids from the provider
  catalog (never invented).
- **Covering options** (wig / scarf / hat) and **"no covering"** are **text-only** —
  valid, respectful choices presented without a fake preview.
- When source hair is too short for a style, the provider returns
  `error_hair_too_short`. This is a **first-class, supported flow** with calm,
  reassuring copy (`src/lib/labels.ts`): it explains the limitation, makes clear it
  isn't a problem with the user's photo, and points to covering options. It is never
  surfaced as a generic error, and it is covered by tests.

---

## Preview budget, reuse & privacy

- **Budget:** unlimited by default (`MAX_PREVIEWS_PER_SESSION=0`), enforced
  **server-side** (`src/lib/decision/limits.ts`) — never trusted to the client. Set a
  positive number for a hard ceiling. Credits are spent only on new, explicitly
  requested renders.
- **Reuse:** an identical successful preview (same template + same photo) is served
  from cache and **does not** re-charge the budget.
- **No silent retries:** a failed preview is **never auto-retried**; retries happen
  only on explicit user action.
- **Privacy by design:** photos require explicit consent before capture/upload;
  sessions are anonymous with expiry; **Delete / reset** removes the session and all
  stored photos from disk.

---

## Scripts

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `npm run dev`        | Start the dev server (<http://localhost:3000>). |
| `npm run build`      | Production build.                              |
| `npm run start`      | Serve the production build.                    |
| `npm run lint`       | ESLint (`next lint`).                          |
| `npm run typecheck`  | TypeScript `tsc --noEmit`.                     |
| `npm run test`       | Run the Vitest suite once.                     |
| `npm run test:watch` | Run Vitest in watch mode.                      |

> **Windows PowerShell note:** this project is developed against PowerShell, where
> `&&` is not a statement separator. Chain commands with `;`, and invoke the npm CLI
> as `npm.cmd` / `npx.cmd` if script execution policy blocks `npm.ps1`.

---

## Testing

The suite focuses on the deterministic core and the provider adapters — where
correctness matters most and which need no network or database:

| Test file                                       | Covers                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `decision/engine.test.ts`                        | State machine, transitions, plan assembly (API-detected vs. corrected hair). |
| `decision/options.test.ts`                       | Options bind to real template ids; covering options text-only; ordering. |
| `decision/scenarios.test.ts`                     | Deterministic selection; every scenario offers an undecided path.   |
| `decision/limits.test.ts`                        | Budget cap, reuse of successes only, no auto-retry.                 |
| `agent/agent.test.ts`                            | The 12 required behaviours of the decision-support loop.            |
| `guide/guide.test.ts`                            | Deterministic guidance; never invents options; stable for the state.|
| `providers/mock.test.ts`                         | Deterministic mock adapters; `error_hair_too_short`; labelled SVG.  |
| `providers/youcam/hair-analysis.test.ts`         | Provider strings → stable enum.                                     |
| `validation.test.ts`                             | Request schemas + guide response contract + error copy.            |
| `access.test.ts`                                 | Private Preview gate: constant-time check, signed/expiring cookie, rate limit. |

Run everything:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

---

## Project structure

```
src/
├─ app/
│  ├─ page.tsx                 # Welcome
│  ├─ prepare/page.tsx         # Priorities → photo → Hair Record
│  ├─ rehearse/page.tsx        # Explore options + previews
│  ├─ plan/page.tsx            # Plan A/B, scenarios, printable sheet
│  ├─ layout.tsx               # Root layout (SessionProvider)
│  ├─ globals.css              # Design tokens + print stylesheet
│  └─ api/                     # Route handlers (see API surface)
├─ components/                 # UI kit + feature components (Header, Preview Access, …)
└─ lib/
   ├─ api/                     # http helpers + secret-free serialization
   ├─ access.ts                # Private Preview gate (server): pass check + signed cookie
   ├─ decision/                # engine, options, scenarios, limits, catalog
   ├─ agent/                   # observe, policy, validate, execute
   ├─ guide/                   # deterministic guide (no LLM)
   ├─ providers/               # youcam (live) + mock adapters, shared client
   ├─ store/                   # durable file persistence
   ├─ api-client.ts            # browser fetch wrappers
   ├─ photo.ts                 # shared normalize pipeline (JPEG ≤1024px)
   ├─ session-context.tsx      # client session state + credentials
   └─ config.ts · types.ts · validation.ts · labels.ts
```

Runtime data (`.data/`) and local env files are git-ignored — personal data and
secrets are never committed.

---

## Design docs

The build is grounded in four documents in the repo root:

- [`scope.md`](scope.md) — problem, users, boundaries, non-goals.
- [`solution.md`](solution.md) — the product concept and journey.
- [`tech-implementation.md`](tech-implementation.md) — architecture and data model.
- [`api-feasibility.md`](api-feasibility.md) — YouCam API contracts and limitations.

---

## License

Released under the **MIT License** — see [`LICENSE`](LICENSE).

---

<div align="center">

*LookAhead helps people prepare for what's next — on their own terms, at their own
pace, with no pressure to have it all figured out.*

</div>
