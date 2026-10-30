# LookAhead — Scope

> Guided decision-rehearsal for people preparing for treatment-related hair loss.
> Prepare for what's next.

---

## 1. Purpose & Guiding Principle

LookAhead helps users **rehearse appearance decisions before those decisions become urgent**. The product's central principle:

**Help the user make decisions — do not just generate hairstyles, and do not decide for them.**

Existing advice can explain the options. LookAhead goes further by combining guided decision-making, personalized visual exploration, scenario-based fallback planning, and a reusable personal plan.

*Note: Do not claim the combination is unique without competitor research. Do not reduce the product to a chatbot, hairstyle gallery, checklist, or image-generation wrapper.*

---

## 2. Core User Journey

| Step | Action |
|------|--------|
| 1 | Capture or upload a photo representing current appearance |
| 2 | Review hair-analysis output; confirm or correct the result |
| 3 | Share priorities (e.g., familiarity, comfort, privacy, control over timing) |
| 4 | Explore relevant appearance choices through a guided decision flow |
| 5 | Visualize supported options via YouCam virtual try-on |
| 6 | Select a preferred option (**Plan A**) |
| 7 | Rehearse a realistic scenario where Plan A fails; identify **Plan B** |
| 8 | Produce a personal **LookAhead Plan** (choices, visual references, unresolved decisions, questions for a care team/stylist) |

Users must be able to revisit and change any choice. The experience should feel supportive, respectful, and nonjudgmental.

---

## 3. Product Intelligence

The workflow is a **guided decision system**, not a chatbot bolted onto an image generator. It has three parts:

- **Decision engine** — transparent, rule-based logic mapping user preferences and choices to relevant next steps.
- **AI guide** — asks the next useful question, explains trade-offs, flags unresolved choices, summarizes decisions.
- **Visualization tools** — call YouCam APIs when an image helps the user evaluate an option.

### Constraints on the AI
- Recommends *which decision to explore next*, but **never chooses an appearance on the user's behalf**.
- Must **not** diagnose, predict individual hair-loss timing/severity, recommend treatment, or invent medical facts.
- Medical information must be conservative, sourced, non-personalized, and framed as general guidance.
- Users are encouraged to confirm treatment-specific questions with their care team.

---

## 4. MVP Scope

### In Scope
- Responsive web application
- Guided onboarding and user priorities
- Photo upload/capture and a hair-analysis result (with user confirm/correct)
- Preference-driven decision flow (rule-based)
- Selected, limited hairstyle visual try-on
- Plan A / Plan B scenario rehearsal
- Personal LookAhead Plan that can be saved or exported
- Basic privacy controls and a reset option
- API error handling, loading/retry states, sensible demo flow

### Out of Scope
- Medical diagnosis or personalized treatment recommendations
- Predicting when or how much hair will fall out
- Unlimited image generations
- Wig marketplace or product purchasing
- Insurance, payment, or reimbursement workflows
- Social networking, community, or clinician portals

*Guideline: The first version focuses on a coherent end-to-end journey. Add features only if they make that journey materially more useful.*

---

## 5. External API Scope (YouCam)

Two API roles are intended — both **require verification against official documentation before implementation**.

### API Role 1 — Hair Analysis (verify first)
- Candidates: **Hair Type Detection**, **Hair Length Detection**, **Hair Density Detection**.
- Choose the **single** endpoint that provides reliable, usable output and meaningfully improves the experience.
- **Do not integrate all three by default.**
- If the analysis output does not add real value, explain the limitation before integrating it.

### API Role 2 — Visualization (primary candidate)
- Candidate: **AI Hairstyle VTO / Hairstyle Try-On**.
- Core visual interaction: preview a selected hairstyle on the user's own photo.
- **Key limitation to verify:** hairstyle try-on is *not* the same as virtual wig or head-covering try-on. Confirm whether the endpoint supports the exact transformations needed.
- If it cannot convincingly visualize the chosen options, **adapt the MVP around the transformations it actually supports** rather than promise unsupported functionality.

### Verification checklist (per endpoint)
- Exact endpoint names
- Supported transformations
- Input/output formats
- Authentication
- Quotas
- Credit costs
- Availability

---

## 6. Technical Principles

- Keep the initial architecture **simple**.
- Separate **UI**, **decision rules**, **AI orchestration**, and **YouCam API integration**.
- Call external APIs through a **server-side layer**; keep credentials out of client code.
- **Limit and reuse** visual generations to conserve credits.
- Provide graceful **loading, error, and retry** states.
- **Minimize retained personal data**; explain photo handling to the user.
- Do **not** finalize the tech stack, database, or detailed architecture until API capabilities and constraints are reviewed.

---

## 7. Immediate Next Task

Produce a short **feasibility assessment** of the YouCam APIs before any build:

1. Inspect the official YouCam documentation supplied with the project.
2. Compare the candidate hair-analysis APIs and the hairstyle visualization API.
3. Cover: capabilities, limitations, costs, and whether each API contributes meaningfully to the intended user journey.

> Do not generate the full PRD or build the application yet. Await the next instruction after the feasibility assessment.

---

## 8. Document Status

- **This file:** Scope — approved direction and boundaries.
- **Next:** PRD / technical specifications (pending).
- **Build:** Not started.
