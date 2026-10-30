# LookAhead — YouCam API Feasibility Assessment

> Investigation of the official Perfect Corp / YouCam API documentation to confirm how the two intended integrations will actually be implemented, and whether they support the LookAhead user journey.
>
> **Sources inspected (official):**
> - AI Hair Length Detection — `https://docs.perfectcorp.com/reference/ai_hair_length_detection`
> - AI Hair Type Detection — `https://docs.perfectcorp.com/reference/ai_hair_type_detection`
> - AI Hairstyle Virtual Try-On (usage guide + endpoints) — `https://docs.perfectcorp.com/reference/ai_hairstyle`
> - AI Hairstyle unit consumption — `.../ai_hairstyle/section/overview/unit-consumption`
> - Marketing pages — `https://yce.perfectcorp.com/ai-api/...`

---

## 0. Executive Summary

| Role | Chosen API | Verdict |
|------|-----------|---------|
| **Analysis** | **AI Hair Length Detection** | ✅ Feasible and appropriate. Single front-facing photo, 2 units, returns a clear length category. Directly relevant to the "keep / cut shorter / shave" decision. |
| **Analysis (alternative)** | AI Hair Type Detection | ⚠️ Feasible but heavier: requires a **3-angle** capture and returns curl-pattern classification, which adds less value to our decision journey. Keep as fallback only. |
| **Visualization** | **AI Hairstyle Virtual Try-On (hair-transfer)** | ⚠️ Feasible for **hairstyle** previews only. **Does not support wigs, scarves, or hats**, and **requires existing hair + visible shoulders**. This materially shapes the MVP. |

**Two findings drive the MVP design:**

1. **Hairstyle VTO is a hair-*transfer* model, not a wig/covering try-on.** It applies a target hairstyle onto a source photo that must already have hair. It cannot render a bald/shaved head, a wig, a scarf, or a hat. Covering options must therefore remain **text/decision-based**, not visually previewed, in the MVP.
2. **`error_hair_too_short`** is a documented failure mode. Users whose hair is already very short may not get a successful transfer. The photo/option flow must handle this gracefully.

**Bottom line:** Both APIs are implementable with a clean server-side async pattern. The product must be framed around *hairstyle* rehearsal (e.g., current length → shorter cut) with covering options discussed but not previewed, exactly as the scope anticipated.

---

## 1. Common Foundations (apply to both APIs)

### 1.1 Base URL & Authentication
- **API base:** `https://yce-api-01.makeupar.com`
- **Auth header (every call):** `Authorization: Bearer YOUR_API_KEY`
- **API key location:** `https://yce.makeupar.com/api-console/en/api-keys/`
- **Implication for us:** the key lives **only** in server-side env vars, per the technical plan. All calls go through our backend proxy (`/api/sessions/:id/...`).

### 1.2 Shared File Upload API — `POST /s2s/v2.0/file`
Both capabilities use the same two-step upload:

**Step A — register the file (JSON):**
```jsonc
POST /s2s/v2.0/file
{
  "files": [
    { "content_type": "image/jpg", "file_name": "selfie_01.jpg", "file_size": 547541 }
  ]
}
```
**Response** returns a `file_id` plus a signed upload URL:
```jsonc
{
  "status": 200,
  "data": {
    "files": [{
      "content_type": "image/jpg",
      "file_name": "selfie_01.jpg",
      "file_id": "SaGaqp...BFaud",
      "requests": [{
        "method": "PUT",
        "url": "https://yce-us.s3-accelerate.amazonaws.com/demo/ttl30/...signature...",
        "headers": { "Content-Length": "547541", "Content-Type": "image/jpg" }
      }]
    }]
  }
}
```
**Step B — upload the binary to the signed URL:**
```bash
PUT <requests.url>
Content-Type: image/jpg
Content-Length: 547541
<binary image bytes>
```
> **Shortcut:** if the image is already hosted at a public HTTPS URL, you can skip the File API and pass `*_file_url` directly to the task endpoint. For a privacy-first MVP we will **upload via the File API** rather than expose user photos on our own public URLs.

### 1.3 Async Task + Polling Pattern (both APIs)
1. `POST /s2s/v2.0/task/<capability>` → returns `data.task_id`.
2. `GET /s2s/v2.0/task/<capability>/{task_id}` → poll until `task_status` is `success` or `error`.
3. While `running`, **no units are consumed** (confirmed in the Hair Length doc).
4. On `success`, read `data.results` (image URL for VTO, classification for analysis).

**Backend mapping (from `tech-implementation.md`):** our adapter manages `task_id` + polling and exposes only `processing | success | failed` to the frontend. Prefer **webhook** completion if/when we register an endpoint; otherwise poll with backoff.

### 1.4 Result URL is Temporary
VTO/analysis result URLs are signed S3 links under a `ttl30` path (short-lived). **Do not store them as permanent references.** If we keep a preview in the user's plan, the backend must **download and re-host** it in controlled storage within the TTL — subject to Perfect Corp terms and our privacy design.

---

## 2. API Role 1 — Hair Analysis

### 2.1 Recommended: AI Hair Length Detection

| Attribute | Detail |
|-----------|--------|
| **Create task** | `POST /s2s/v2.0/task/hair-length-detection` (body references the uploaded `file_id` as source) |
| **Poll task** | `GET /s2s/v2.0/task/hair-length-detection/{task_id}` |
| **Input** | **One** front-facing selfie, hair left down over the chest (not tied up) |
| **Camera Kit mode** | `hairlength` (full hair-length capture from a distance) — optional in-browser guided capture SDK |
| **Output** | `result` string from: `"above the ears"`, `"ear length"`, `"ear length or longer"`, `"short hair"`, `"short hair or longer"`, `"above chest"`, `"above chest or longer"`, `"long hair"` |
| **Categories** | 5 length classes: Above-Ear, Ear-Length, Short, Medium (collarbone), Long |
| **File specs** | ≥ 320px and ≤ 4096px per side; auto-resized if long side > 1080px; **< 10MB**; **jpg / png** |
| **Units** | **2 per successful detection** |
| **Error codes** | `error_below_min_image_size`, `error_face_position_invalid`, `error_face_position_too_small`, `error_face_position_out_of_boundary`, `error_insufficient_lighting`, `error_face_angle_invalid` (front shot must be within 10° of straight) |

**Why it fits LookAhead:** length is the axis the user actually decides on ("keep it, cut it shorter, shave it"). A single photo keeps onboarding light, and the 5-class result maps cleanly onto our decision-engine options and onto realistic hairstyle-transfer targets.

### 2.2 Alternative: AI Hair Type Detection

| Attribute | Detail |
|-----------|--------|
| **Create task** | `POST /s2s/v2.0/task/hair-type-detection` |
| **Poll task** | `GET /s2s/v2.0/task/hair-type-detection/{task_id}` |
| **Input** | **Three-angle** capture: front, turn-right, turn-left (Camera Kit mode `hairtype`, a 3-phase flow) |
| **Output** | Classification into **9 categories** (straight / wavy / curly / kinky, ~1A–4C) based on texture, thickness, curl pattern |
| **Units** | Consumed on success (verify exact count in console; same async "no units while running" rule) |

**Trade-off:** richer hair characterization, but a **3-photo capture** adds friction and the curl-type result is **less directly actionable** for the keep/cut/shave decision. **Recommendation: Hair Length Detection as primary; Hair Type only if we later want texture-aware styling advice.** Do not integrate both in the MVP (per scope).

---

## 3. API Role 2 — AI Hairstyle Virtual Try-On

The current usage guide documents the **`hair-transfer`** family (v2.1). A legacy **`hair-style`** family (v2.0) also exists in the reference index.

| Endpoint (v2.1, recommended) | Purpose |
|------------------------------|---------|
| `GET /s2s/v2.1/task/template/hair-transfer?page_size=20&starting_token=...` | List predefined style templates (paginated) |
| `POST /s2s/v2.1/task/hair-transfer` | Create a try-on task |
| `GET /s2s/v2.1/task/hair-transfer/{task_id}` | Poll status / retrieve result |

> Legacy v2.0 equivalents: `GET /s2s/v2.0/task/template/hair-style`, `POST /s2s/v2.0/task/hair-style`, `GET /s2s/v2.0/task/hair-style/{task_id}`. Confirm with the account which family is enabled before locking the adapter.

### 3.1 Create-task request
```jsonc
POST /s2s/v2.1/task/hair-transfer
{
  // SOURCE (the user's photo) — one of:
  "src_file_id": "<file_id from /s2s/v2.0/file>",
  // "src_file_url": "https://.../selfie.jpg",

  // TARGET STYLE — exactly one of:
  "template_id": "<from template list>",     // Preset Mode
  "ref_file_id": "<uploaded reference>",      // Custom Mode
  "ref_file_url": "https://.../style.jpg"     // Custom Mode
}
```
**Response:** `{ "status": 200, "data": { "task_id": "..." } }`

### 3.2 Poll + result
```jsonc
GET /s2s/v2.1/task/hair-transfer/{task_id}
// success:
{
  "status": 200,
  "data": {
    "error": null,
    "results": { "url": "https://yce-us.s3-accelerate.amazonaws.com/demo/ttl30/...signature..." },
    "task_status": "success"
  }
}
// invalid key:
{ "status": 401, "error": "Unauthorized", "error_code": "InvalidAccessToken" }
```

### 3.3 Two styling modes
| Mode | How | Units (v2.1) | Use in LookAhead |
|------|-----|--------------|------------------|
| **Preset** | `template_id` from the template list (150+ styles) | **2** | ✅ Primary — curated, predictable, cheaper to reason about |
| **Custom** | `ref_file_id` / `ref_file_url` (a reference style photo) | **2** | Optional — only if we host style reference images |

> v2.0 costs **1 unit (preset)** / **2 units (custom)**; v2.1 costs **2 / 2**. Verify which version the account is provisioned for, then set the session cap accordingly.

### 3.4 File specs (VTO source & reference)
| Constraint | Value |
|------------|-------|
| Formats | **jpg / jpeg only** (⚠️ no PNG, unlike Hair Length) |
| Size | < 10MB |
| Long side | ≤ **1024 px** |
| Face width | ≥ **128 px** |
| Head pose | pitch −10°..+10°, yaw −45°..+45°, roll −15°..+15° |
| Faces | **Single face**, full frontal, hair clearly visible, **shoulders visible** |

### 3.5 VTO error codes → UX handling
| Error code | Meaning | LookAhead handling |
|------------|---------|--------------------|
| `error_no_shoulder` | Shoulders not visible | Prompt for a wider shot |
| `error_large_face_angle` / `error_face_pose` | Pose out of range | Prompt to face camera straighter |
| `error_insufficient_landmarks` | Face/body not detectable | Prompt clearer, well-lit photo |
| **`error_hair_too_short`** | **Existing hair too short to transfer** | **Key case** — explain that a hairstyle preview isn't possible on very short hair; fall back to text-based options |

---

## 4. Critical Findings & Risks for LookAhead

1. **No wig / scarf / hat visualization.** `hair-transfer` only restyles existing hair. The catalog lists *separate* try-on APIs for some covering categories, but per scope these stay **out of the MVP**. Covering options (wig, scarf, hat, no covering) must be **decision/text items**, not previews. This is consistent with our scope's stated limitation.
2. **Cannot preview a shaved/bald look.** The model needs source hair; a "shave it all off" option cannot be reliably rendered. Treat "shaved/buzzed" as a **described** option, or only offer transfer where `error_hair_too_short` won't trigger.
3. **`error_hair_too_short` is likely for our audience.** Some users begin with short hair. The photo step should set expectations, and the option list should adapt if a transfer fails.
4. **Format mismatch between the two APIs.** Hair Length accepts jpg/png; VTO accepts **jpg/jpeg only**. Normalize uploads to JPEG server-side before any VTO call.
5. **Different max dimensions.** VTO long side ≤ 1024px; Hair Length ≤ 4096px (auto-resize >1080px). Resize/compress to VTO constraints in the adapter.
6. **Temporary result URLs.** Re-host previews within the TTL if they are saved to the plan; otherwise links will expire.
7. **Two hairstyle API families (v2.0 hair-style vs v2.1 hair-transfer).** Confirm the provisioned family/version and unit cost with the account before finalizing the adapter.

---

## 5. Credit Budget for the MVP

Per `solution.md`, cap at **3 intentional previews per session**.

| Step | Units |
|------|-------|
| Hair Length Detection (1×) | 2 |
| Hairstyle VTO, preset mode (up to 3×) | 2 each → 6 |
| **Typical full session** | **~8 units** |

**Backend enforcement (from tech plan):**
- Configurable max of **3** preview tasks/session; count attempts and successes distinctly.
- Block duplicate submissions while a task is `running`.
- **Reuse** a prior result when the user revisits the same style (no new task).
- Failed tasks (e.g., `error_hair_too_short`) — decide whether they count against the cap; recommended: **failed-on-provider-error does not consume the user's budget** (units are only consumed on success anyway).
- Log `task_id`, status, and error codes — **never** image content or the API key.

> Action: confirm the account's actual unit price/quota, then set the numeric cap in config.

---

## 6. Implementation Mapping (adapter contract)

Each capability gets a **provider adapter** behind a stable internal interface, so endpoints/versions can change without touching the app.

```
HairAnalysisAdapter
  analyze(photoRef) -> { status, resultCategory?, rawResult?, errorCode? }
  // POST task/hair-length-detection -> poll -> normalize result string to our enum

HairstyleVtoAdapter
  listTemplates(cursor?) -> { templates[], nextCursor? }
  createPreview(srcPhotoRef, { templateId | refSource }) -> { taskId }
  getPreview(taskId) -> { status: processing|success|failed, resultUrl?, errorCode? }
```

**Internal routes already planned** (`tech-implementation.md`) map directly:
- `POST /api/sessions/:id/photos` → upload via `/s2s/v2.0/file` (+ PUT to signed URL), store `file_id` as `photoRef`.
- `POST /api/sessions/:id/hair-analysis` → `HairAnalysisAdapter.analyze`.
- `POST /api/sessions/:id/previews` → `HairstyleVtoAdapter.createPreview` (+ poll), enforce cap.

**Photo pipeline (normalized once, reused):**
`validate → convert to JPEG → resize (long side ≤1024, face ≥128) → upload → reuse file_id for both analysis and VTO`.

**Camera capture (optional):** the **JS Camera Kit** (`https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js`) offers guided in-browser capture with quality validation and a `hairlength` mode. It requires HTTPS and a `<div id="YMK-module">` mount point, and `window.YMKAsyncInit` defined before load. Useful for reducing `error_*` failures, but plain file upload is sufficient for the MVP.

---

## 7. Open Questions to Verify Before Build

1. Which hairstyle family/version is enabled on our key — **v2.1 `hair-transfer`** (recommended) or legacy **v2.0 `hair-style`** — and its exact unit cost?
2. Exact **unit price and monthly quota** for our hackathon account (to finalize the preview cap).
3. Confirm **Hair Type Detection unit cost** if we keep it as a fallback.
4. Do template styles include **shorter-cut / buzz** options usable for a "cut it shorter" rehearsal, given the source-hair requirement?
5. Are **webhooks** available for task completion, or is polling required?
6. Result URL **TTL** exact duration and Perfect Corp **terms on re-hosting** generated images.
7. Does the account permit our intended **data retention / deletion** behavior for uploaded photos?

---

## 8. Recommendation

- **Analysis:** adopt **AI Hair Length Detection** (single photo, 2 units, directly decision-relevant). Keep Hair Type Detection documented but unintegrated.
- **Visualization:** adopt **AI Hairstyle Virtual Try-On v2.1 (`hair-transfer`), Preset mode** for hairstyle previews only.
- **MVP framing:** visually rehearse **hairstyle changes on existing hair** (e.g., current length → a shorter style). Present **wigs, scarves, hats, and shaving** as **guided decision options without visual preview**, exactly as the scope's limitation anticipated.
- **Handle `error_hair_too_short`** as a first-class UX path, not an edge case.
- Proceed to build the **UI + workflow with mocked adapter responses first** (per tech plan step 2), then integrate Hair Length, then VTO, once the open questions above are answered with a real key.

---

## Document Status

- **Companion to:** `scope.md`, `solution.md`, `tech-implementation.md`
- **This file:** YouCam API feasibility assessment — complete.
- **Next deliverable:** detailed PRD (informed by the findings and open questions above).
- **Build:** Not started.
