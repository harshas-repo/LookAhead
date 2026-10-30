# LookAhead — Judge & Tester Guide

Thank you for trying LookAhead. This is a **private preview** build. You do **not**
need a YouCam API key or any developer setup — the app runs on the platform's own
secured YouCam configuration automatically.

## What you'll need

- The deployed LookAhead URL.
- A **LookAhead Access Pass**, provided to you separately through a private channel.
  It is a lightweight preview pass — not an account, login, or password.
- A photo of hair to try the flow (any clear, front-facing photo works). If you'd
  rather not use your own, use the sample/test image supplied with these instructions.

## Steps

1. **Open** the deployed LookAhead application.
2. Click **Preview Access** in the top-right (beside **Privacy**), enter the provided
   **Access Pass**, and choose **Continue**. You can browse the app freely first — the
   pass is only needed to run live, real-API previews (the Hair Record and hairstyle
   previews). You'll only be asked once: it stays valid in this browser for several days,
   so refreshing and moving between screens won't re-prompt you.
3. **Prepare** — note what matters most to you, then add a photo (upload or camera)
   and create the **Hair Record** (length / density / type). This describes the hair
   in the photo today; it is never a prediction.
4. **Rehearse** — explore a small set of supported looks and generate a preview on
   your photo where available. Previews are created only when you press the button.
5. **Plan** — choose a **Plan A**, rehearse a "what if" **Plan B**, add questions for
   your care team, then print or export your plan.

## Good to know

- **No API key, ever.** Judges are never asked for a YouCam key. Live previews use the
  platform's secured server-side configuration; the key is never shown in the browser.
- **Private by design.** Your photo and choices are stored for your anonymous session
  only. **Privacy → Delete everything** removes the session, photo, and previews from
  both the device and the server.
- **Honest previews.** Hairstyle previews are a planning aid, not a promise about the
  future. Some options (wigs, scarves, hats, no covering) are presented as text because
  the underlying API restyles existing hair only.
- **Wrong pass?** You'll see "That access pass isn't valid. Please check the code and
  try again." Check for stray spaces and try again; repeated attempts are briefly
  rate-limited to keep the preview private.

## If something doesn't work

- If a valid pass is rejected, confirm there are no leading/trailing spaces and that
  cookies are enabled for the site (the pass is remembered with a cookie).
- If a live preview fails, the app shows a calm, specific message — for example, hair
  too short for that style. That is an expected, supported outcome, not a crash.

---

> **Maintainer note (not for judges):** the real `LOOKAHEAD_ACCESS_CODE` and
> `YOUCAM_API_KEY` are set as deployment environment secrets and are intentionally
> **not** present in this file, the README, the source code, or the repository. Share
> the access pass with testers through a private channel only.
