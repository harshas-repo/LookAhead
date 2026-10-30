# LookAhead — MVP Solution & Implementation Plan

LookAhead helps people preparing for treatment-related hair loss make appearance decisions before they become urgent. The MVP is built around five stages: understand the user, prepare, visualize options, rehearse a backup plan, and produce a personal plan.

---

## The MVP User Journey

### 1. Understand Me
**Input and personalization**

The user optionally enters their expected treatment date, uploads a current photo, and selects their priorities: maintaining their familiar appearance, comfort, privacy, cost, or control over timing.

### 2. Hair Record & Preparation
**YouCam hair-analysis API**

Analyze the current photo using one selected hair-analysis endpoint. Show the detected characteristics for the user to confirm or correct. Then provide general preparation guidance and highlight decisions that may need to happen early, with treatment-specific advice referred to the care team.

### 3. Rehearse My Options
**YouCam hairstyle visualization API**

The decision engine identifies relevant choices based on the user's priorities. The user selects an option, and the app generates a visual preview using the supported YouCam transformation. Limit generations to a small number, such as three per session.

### 4. Plan A / Plan B
**AI-guided decision rehearsal**

The user chooses a preferred approach, then faces a realistic scenario that could make it impractical. For example: *"Your preferred wig feels uncomfortable. What would you choose instead?"* The user selects a fallback and can explore another supported visual option if needed.

### 5. My LookAhead Plan
**Personalized output**

Generate a one-page plan containing the user's preferences, chosen option, backup plan, selected visual references, unresolved decisions, and questions to ask their care team or stylist.

---

## How the Decision-Making Will Work

The AI will **not** independently decide what the user should do. We combine three components:

| Component | Role |
|-----------|------|
| **User preferences and choices** | What matters to the person, what they like, and what they are comfortable with |
| **Rule-based decision engine** | Maps priorities to relevant choices, follow-up questions, and fallback scenarios |
| **AI guide + YouCam visualization** | Guides the conversation, helps explore trade-offs, and visualizes selected options |
| **Plan A + Plan B** | A practical, user-selected plan with alternatives and outstanding decisions |

For example, if comfort and maintaining a familiar appearance are the user's top priorities, the system may help them compare a shorter hairstyle with another supported option. After they choose a preferred path, the AI introduces a relevant fallback scenario. **The user makes the final decision.**

---

## The Two YouCam Integrations

| Integration | Purpose in the MVP |
|-------------|--------------------|
| **Hair-analysis API** | Establishes a baseline from the user's current photo. We will compare Hair Type, Hair Length, and Hair Density Detection and select just one. |
| **Hairstyle VTO API** | Generates a preview of a user-selected hairstyle, provided the official endpoint supports that transformation. |

We must verify whether hairstyle VTO can support the exact looks we want to demonstrate. We should **not** promise realistic wig, scarf, or hat previews unless the API supports them. Those options can still be discussed as user-selected alternatives, even if their visual previews are outside the MVP.

---

## What We Will Deliberately Keep Small

- One guided end-to-end journey, not a collection of unrelated features.
- One hair-analysis API and one visualization API.
- A maximum of **three** intentional visualization generations per session.
- A small set of rule-driven decisions and realistic fallback scenarios.
- A downloadable or printable personal plan.
- No medical predictions, diagnosis, wig marketplace, or complex patient-management system.

The user should be able to **revisit and revise** decisions rather than being forced through a rigid, one-way questionnaire.

---

## What the Final Demo Must Prove

By the end of the experience, a user should have:

1. A reviewed baseline hair profile.
2. A clear understanding of the appearance decisions that matter to them.
3. At least one relevant visual preview.
4. A selected Plan A and a considered Plan B.
5. A personal LookAhead Plan they can use outside the app.

The key demonstration is not that we can generate a hairstyle. It is that we can turn a user's uncertainty into a set of considered, revisable decisions. **That is the core of the MVP.**

---

## Document Status

- **Companion to:** `scope.md`
- **This file:** MVP solution & implementation plan — approved direction.
- **Next:** PRD / technical specifications (pending).
- **Build:** Not started.
