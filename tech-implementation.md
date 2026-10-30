# LookAhead — Technical Implementation Plan

The technical approach prioritizes a working, reliable end-to-end MVP in Qoder, with the two YouCam integrations and the decision-rehearsal workflow as the core.

**Guiding principle:** build a simple web app with a deterministic decision engine, a deterministic guided workflow, and server-side YouCam API integrations. We do not need a complex multi-agent framework.

> **Decision update (final alignment):** LookAhead ships **without any LLM**. The guided workflow is fully deterministic — a bounded decision-support loop (observe → apply rules → select action → validate → present → process response → persist → reassess). Any remaining references below to an "AI guide" or "LLM provider" are historical planning notes and are not implemented.

---

## 1. Proposed Architecture

```
Frontend — responsive web app
  Onboarding · Photo upload · Hair Record · Decision flow · Previews · Personal Plan

Backend — application API
  Session state · Decision rules · Decision-support loop · Photo validation · API proxy

External
  YouCam .............. Hair analysis + hairstyle VTO

Session storage
  Preferences · Decisions · Scenario answers · Preview references · Final plan
```

### Recommended starting stack

- **Frontend:** Next.js with React and TypeScript.
- **Styling:** Tailwind CSS with reusable, accessible components.
- **Backend:** Next.js server-side route handlers, so a separate backend service is not required initially.
- **Validation:** Zod or equivalent schema validation for API requests and guide responses.
- **Persistence:** start with server-side session storage or a small database if the hosting setup supports it. Do not rely on browser memory alone if users need to return to their plan.
- **Guide:** deterministic and rule-based. No LLM is used; guidance is produced by the decision-support loop.
- **Export:** browser print-to-PDF for the initial personal plan; use a dedicated PDF library only if the layout requires it.

> These are proposed defaults, not fixed requirements. Qoder should first inspect the existing project and keep its current stack if it already has a sound foundation.

---

## 2. Photo and YouCam API Integration

This is the first technical risk to resolve, because the APIs determine how much work the user must do and how the photo flow behaves.

The official YouCam pages describe the hairstyle API as accepting an image and a `style_id`, then returning a transformed image URL. The Hair Type Detection documentation describes a file-upload, task-creation, polling, and result-retrieval workflow, and one documented flow requires front and two angled photos.

For this MVP, investigate **Hair Length Detection** first, with **Hair Type Detection** as the alternative. Hair length has a more direct connection to the user's current hair record and shorter-cut rehearsal, while hair type classification may add limited value to this particular decision journey. Verify the exact photo requirements and outputs in the API documentation before committing.

### Photo-processing flow

1. **Upload photo** — validate file type, size, and image dimensions.
2. **Create private session photo** — do not expose API credentials or unnecessarily retain the original image.
3. **Call analysis API** — use the endpoint's actual upload and response protocol.
4. **Show result for confirmation** — user can correct or skip the detected attribute if appropriate.
5. **Reuse the approved photo for VTO** — generate previews only after the user chooses an option.

Implement a **provider adapter** for each YouCam capability rather than embedding provider-specific request logic throughout the frontend. This makes it possible to change the analysis endpoint without rewriting the rest of the application.

For asynchronous endpoints, the backend manages task IDs and status polling. The frontend receives a simple state such as `processing`, `success`, or `failed`, rather than understanding the provider's internal response structure.

---

## 3. Application Modules

| Module | Responsibility |
|--------|----------------|
| `onboarding` | Collect priorities and optional timing information. |
| `photo` | Validate uploads, handle photo consent, and manage image references. |
| `hair-analysis` | Call the selected analysis API and normalize its result. |
| `decision-engine` | Map user preferences and choices to relevant next steps. |
| `guide` | Generate contextual questions and explain trade-offs. |
| `visualization` | Select supported styles, call hairstyle VTO, and manage generation limits. |
| `scenario-planner` | Run Plan A / Plan B scenarios and save user decisions. |
| `personal-plan` | Assemble and export the final plan. |

The decision rules are the single source of behaviour: the application uses predefined questions and scenarios and requires no external AI provider.

---

## 4. Backend Route Design

Server-side route handlers with typed request and response schemas. These are proposed internal routes, not YouCam endpoint names.

| Internal route | Purpose |
|----------------|---------|
| `POST /api/sessions` | Create a new LookAhead session. |
| `PATCH /api/sessions/:id` | Save preferences and user choices. |
| `POST /api/sessions/:id/photos` | Validate and register an uploaded photo. |
| `POST /api/sessions/:id/hair-analysis` | Run the selected analysis. |
| `POST /api/sessions/:id/guide` | Get the next guided question or scenario. |
| `POST /api/sessions/:id/previews` | Request a hairstyle preview. |
| `POST /api/sessions/:id/decisions` | Save Plan A, Plan B, or an unresolved decision. |
| `GET /api/sessions/:id/plan` | Retrieve the final personal plan. |
| `DELETE /api/sessions/:id` | Delete the session and associated user data where supported. |

The backend must verify that a session belongs to the requesting user or anonymous session token. **Never trust a client-supplied session ID alone as authorization.**

For a hackathon demo, anonymous sessions are acceptable. Use an unpredictable session token, avoid placing personal details in URLs, and set appropriate expiration and deletion behavior.

---

## 5. Decision Engine Implementation

Represent the flow as a **finite-state workflow** rather than a free-form conversation. Each step has a clear expected input and a valid next step.

```
START
  -> PROFILE_CAPTURE
  -> HAIR_RECORD
  -> PREPARATION
  -> OPTION_EXPLORATION
  -> PLAN_A_SELECTED
  -> SCENARIO_REHEARSAL
  -> PLAN_B_SELECTED
  -> PLAN_REVIEW
  -> COMPLETE
```

Users must be able to go back, edit answers, or skip optional steps. A state machine should guide the experience without locking the user into a single path.

Initial rules:

- If the user values familiarity, offer a path to explore keeping a similar appearance or trying a gradual change.
- If comfort is a high priority, include comfort as a question when evaluating covering options.
- If the user has not chosen a fallback, introduce a relevant scenario.
- If a user is unsure, save the decision as unresolved rather than forcing a choice.
- If a user provides a treatment date, offer preparation reminders based on reliable general guidance; do not calculate a guaranteed hair-loss date.

These rules should be configuration-driven and testable. The system must **not** infer medical eligibility or recommend treatment based on hair-analysis results.

---

## 6. Guided Workflow: Inputs and Outputs

The guide receives structured state from the application and returns a constrained response, chosen deterministically from the question bank and scenario templates.

**Example input:**

```json
{
  "priorities": ["comfort", "familiar_appearance"],
  "selectedOption": "shorter_hair",
  "planA": null,
  "unresolvedDecisions": ["backup_if_uncomfortable"],
  "currentStage": "option_exploration"
}
```

**Example output:**

```json
{
  "message": "Let's think about what would make this option comfortable for you.",
  "question": "If your first choice feels uncomfortable, what would you prefer instead?",
  "choices": [
    "Try another option",
    "Choose a different covering",
    "Leave this undecided"
  ],
  "nextAction": "collect_fallback_preference"
}
```

The backend validates the selected action against a schema and rejects anything unexpected. The guide may only select from known questions and scenario templates; it must **not** invent new API actions or modify user choices without consent.

Predefined MVP scenarios (planning scenarios, not medical claims):

- The preferred option feels uncomfortable.
- The user changes their mind about covering their head.
- The preferred option is not available when needed.
- The user wants a different look in a particular setting.

---

## 7. Core Data Model

A small, explicit model. Fields can be refined during the specification phase.

| Entity | Important fields |
|--------|------------------|
| `Session` | `id`, `createdAt`, `expiresAt`, `currentStage` |
| `UserProfile` | `priorities`, `optionalTreatmentDate`, `consentStatus` |
| `HairRecord` | `photoRef`, `analysisProvider`, `analysisResult`, `userCorrections` |
| `Preview` | `id`, `styleId`, `inputPhotoRef`, `outputImageRef`, `status` |
| `Decision` | `questionId`, `selectedOption`, `isResolved` |
| `Plan` | `planA`, `planB`, `questionsForCareTeam`, `updatedAt` |

Store image **references** rather than embedding image data in database rows. Keep analysis results and decisions separate so a user can correct an analysis without losing their plan.

For a first demo, implement using typed objects and a small persistence layer. Add authentication only if the intended deployment requires accounts; do not build an account system merely for the sake of having one.

---

## 8. API Credit and Failure Management

The visual API is the main resource constraint, so the **backend** enforces limits rather than relying on the frontend to behave correctly.

- Set a configurable maximum of three successful or attempted preview requests per session, with retry policy defined separately.
- Prevent duplicate submissions while a request is in progress.
- Reuse a prior result when the user revisits the same preview.
- Keep a record of provider task IDs, request status, and errors — without logging image content or API secrets.
- Handle timeouts and provider failures gracefully.
- Show the user a clear retry option without automatically generating additional previews.
- Verify the actual credit cost and quota before fixing the final limit.

For the hairstyle API, the documented flow uses an image and a style identifier, and returns a generated image URL. Treat that URL as a **provider result**, not a permanent or private storage URL. Verify expiry and retention behavior, and copy the result into controlled storage only if the provider terms and the application's privacy design permit it.

---

## 9. Security and Privacy Requirements

The app handles personal photographs and a potentially sensitive treatment context, so privacy is built in from the start.

- Keep YouCam credentials in server-side environment variables.
- Never expose credentials in frontend code, browser logs, or public repositories.
- Validate file types and sizes; do not trust the filename or client-supplied MIME type alone.
- Do not send treatment details to YouCam unless required by the API (they should not be for hairstyle visualization).
- Avoid storing raw photos or generated preview images longer than necessary.
- Explain that generated images are visual previews, not predictions of treatment-related changes.
- Provide a way to reset or delete the session and associated data.
- Do not include sensitive photo URLs or treatment details in analytics or error logs.

---

## 10. Implementation Order in Qoder

Build and validate in this order rather than generating the whole product at once.

1. **Inspect** the repository and API documentation. Confirm the existing stack, YouCam endpoint requirements, image formats, API credentials, credit limits, and supported hairstyle styles.
2. **Build the UI and workflow with mock API responses.** Complete the five-stage journey before spending credits on integration. Make it usable on desktop and mobile.
3. **Implement session state and the decision engine.** Ensure choices persist, users can go back, and the Plan A / Plan B flow works deterministically.
4. **Integrate one YouCam analysis endpoint.** Test valid and invalid images, loading states, provider errors, and user correction of the result.
5. **Integrate hairstyle VTO.** Test supported styles with suitable sample images, enforce the generation limit, and verify how output images are retained.
6. **Add the deterministic guide.** Constrain output to the workflow schema using predefined questions and scenarios.
7. **Build the final plan and privacy controls.** Ensure the output includes real user decisions, visual references, unresolved items, and an export option.
8. **Run an end-to-end demo test.** Start with a new session and complete the full journey, including one simulated API failure and a return to a previous decision.

---

## 11. Acceptance Criteria

The implementation is ready for the MVP demo when:

- The entire journey works without manual database edits.
- The analysis result can be reviewed or corrected by the user.
- At least one real hairstyle VTO request succeeds using the configured YouCam account.
- The decision engine produces relevant, repeatable next steps.
- Plan A and Plan B persist and appear in the final plan.
- A failed API request does not corrupt the session or silently consume additional preview requests.
- The application does not expose API credentials.
- The user can reset their session and understands how their photo is handled.

### Final product constraint

The standard hairstyle VTO endpoint is for hairstyle transformations, not necessarily wigs, scarves, or hats. The official catalog lists separate APIs for some other virtual try-on categories, including scarf and hat try-on. **Keep those visualizations out of the MVP** unless we verify that the extra API is necessary, available, and affordable.

---

## Document Status

- **Companion to:** `scope.md`, `solution.md`
- **This file:** Technical implementation plan — approved direction.
- **Next deliverable:** API feasibility sheet + detailed PRD.
- **Build:** Not started.
