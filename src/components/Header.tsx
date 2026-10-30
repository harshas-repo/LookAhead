"use client";

/**
 * Header — brand mark, journey navigation, Preview Access, and privacy reset.
 *
 * Editorial and quiet: a wordmark with the mirror/strand logo, an underline nav
 * that works on touch and keyboard, a Private Preview access control, and a
 * private-session reset. No development "mode" label is shown (brief §10).
 *
 * Preview Access replaces the old full-page gate: the app is freely browsable, and the
 * pass — which unlocks the credit-spending live YouCam calls — is entered from a small
 * dialog beside Privacy, mirroring the previous API-key UX. The YouCam key stays on the
 * server and is never shown, entered, or stored in the browser; on success the server
 * only sets an HTTP-only authorization cookie. Server-side `requireAccess` on the live
 * routes remains the real enforcement — this dialog is the UX layer, and it auto-opens
 * if a protected call reports the pass is missing (ACCESS_REQUIRED_EVENT).
 *
 * Dialogs are portaled to document.body: the sticky header uses backdrop-blur, and a
 * backdrop-filter makes an element the containing block for its fixed-position
 * descendants — which would otherwise trap a full-screen modal inside the thin header
 * bar. The portal keeps overlays anchored to the viewport so they center properly.
 */

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import Image from "next/image";
import { ACCESS_REQUIRED_EVENT, ApiClientError, api } from "@/lib/api-client";
import { Button, cx } from "@/components/ui";

const NAV = [
  { href: "/prepare", label: "Prepare" },
  { href: "/rehearse", label: "Rehearse" },
  { href: "/plan", label: "Plan" }
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, reset } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Preview Access state. `required` stays false (control hidden) when no access code
  // is configured (local dev), so the button only appears when a pass is actually needed.
  const [required, setRequired] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [code, setCode] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Ask the server whether a pass is needed and whether this browser already holds one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.getAccess();
        if (!cancelled) {
          setRequired(res.required);
          setAuthorized(res.authorized);
        }
      } catch {
        // Status unknown — stay quiet. A protected call will surface ACCESS_REQUIRED_EVENT.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If a live call reports the pass is missing/expired, open the dialog right where the
  // visitor is so they can enter it without losing their place.
  useEffect(() => {
    function onRequired() {
      setRequired(true);
      setAuthorized(false);
      setAccessError(null);
      setShowAccess(true);
    }
    window.addEventListener(ACCESS_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(ACCESS_REQUIRED_EVENT, onRequired);
  }, []);

  async function submitAccess(event: FormEvent) {
    event.preventDefault();
    if (accessBusy) return;
    setAccessBusy(true);
    setAccessError(null);
    try {
      await api.submitAccess(code.trim());
      setCode("");
      setAuthorized(true);
      setShowAccess(false);
    } catch (err) {
      setAccessError(
        err instanceof ApiClientError && err.message
          ? err.message
          : "That access pass isn't valid. Please check the code and try again."
      );
    } finally {
      setAccessBusy(false);
    }
  }

  async function doReset() {
    setBusy(true);
    await reset();
    setBusy(false);
    setConfirming(false);
    router.push("/");
  }

  return (
    <header className="no-print sticky top-0 z-30 border-b border-hairline/80 bg-paper/85 backdrop-blur-md">
      <div className="shell-mid flex items-center justify-between gap-1 py-3 max-[359px]:px-3 sm:gap-4">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="LookAhead home">
          <Image
            src="/images/logo.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-lg ring-1 ring-hairline/70 transition-opacity group-hover:opacity-90"
          />
          {/* Wordmark hides on the narrowest screens so brand + nav + controls always
              fit without horizontal scroll; the logo mark and aria-label still brand it. */}
          <span className="hidden font-display text-lg tracking-tight text-ink sm:inline">LookAhead</span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-2" aria-label="Journey">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "step" : undefined}
                className={cx(
                  "relative rounded-md px-1.5 py-2.5 text-sm transition-colors sm:px-3.5 sm:py-1.5",
                  active ? "text-ink" : "text-subtle hover:text-ink"
                )}
              >
                {item.label}
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-x-1.5 -bottom-0.5 h-px origin-left bg-periwinkle-deep transition-transform duration-300 ease-editorial sm:inset-x-3.5",
                    active ? "scale-x-100" : "scale-x-0"
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          {required && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 px-1.5 sm:px-3.5"
              onClick={() => {
                setAccessError(null);
                setShowAccess(true);
              }}
              aria-label="Preview Access"
            >
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cx("h-1.5 w-1.5 rounded-full", authorized ? "bg-periwinkle-deep" : "bg-coral")}
                />
                <span className="hidden sm:inline">Preview Access</span>
                <span className="sm:hidden">Access</span>
              </span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 px-1.5 sm:px-3.5"
            onClick={() => setConfirming(true)}
            disabled={!session}
          >
            Privacy
          </Button>
        </div>
      </div>

      {showAccess &&
        required &&
        createPortal(
          <div
            className="no-print fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-title"
          >
            <div className="card w-full max-w-md space-y-4 p-6 shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <h2 id="access-title" className="font-display text-title text-ink">
                  Private Preview access
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAccess(false)}
                  className="-mr-1 -mt-1 rounded-md p-1 text-subtle transition-colors hover:text-ink"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {authorized ? (
                <>
                  <p className="text-sm leading-relaxed text-body/80">
                    Access unlocked — live previews are ready on this device. Your pass stays
                    private and expires on its own; there is nothing else to enter.
                  </p>
                  <div className="flex justify-end">
                    <Button onClick={() => setShowAccess(false)}>Done</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-body/80">
                    Enter the access pass from your test instructions to unlock live, real-API
                    previews.
                  </p>
                  <p className="rounded-card border border-hairline bg-paper/70 px-3.5 py-3 text-xs leading-relaxed text-subtle">
                    <span className="font-semibold text-body/80">Why a pass?</span> LookAhead runs
                    on a shared YouCam API with limited credits. The pass reserves them for judges
                    and keeps open public use from exhausting them before judging is done.
                  </p>

                  <form onSubmit={submitAccess} className="space-y-3" noValidate>
                    <label
                      htmlFor="header-access-pass"
                      className="block text-xs font-semibold uppercase tracking-wide text-subtle"
                    >
                      Access pass
                    </label>
                    <input
                      id="header-access-pass"
                      name="access-pass"
                      type="text"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Enter access pass"
                      autoComplete="off"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-describedby={accessError ? "header-access-error" : undefined}
                      aria-invalid={accessError ? true : undefined}
                      className="w-full rounded-card border border-hairline bg-paper px-3.5 py-3 font-mono text-sm tracking-wide text-ink placeholder:font-sans placeholder:tracking-normal placeholder:text-subtle/60 focus:border-periwinkle-deep focus:outline-none focus:ring-2 focus:ring-periwinkle/40"
                    />

                    {accessError && (
                      <p
                        id="header-access-error"
                        role="alert"
                        className="rounded-card border border-coral/30 bg-coral/[0.08] px-3.5 py-2.5 text-sm leading-relaxed text-[#a4482f]"
                      >
                        {accessError}
                      </p>
                    )}

                    <div className="flex justify-end gap-3 pt-1">
                      <Button variant="ghost" type="button" onClick={() => setShowAccess(false)} disabled={accessBusy}>
                        Cancel
                      </Button>
                      <Button type="submit" loading={accessBusy} disabled={!code.trim()}>
                        Continue
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      {confirming &&
        createPortal(
          <div
            className="no-print fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
          >
            <div className="card w-full max-w-md space-y-4 p-6 shadow-lift">
              <h2 id="privacy-title" className="font-display text-title text-ink">
                Privacy &amp; reset
              </h2>
              <p className="text-sm leading-relaxed text-body/80">
                Your photo and plan are stored privately for this session only. Resetting deletes the session, your
                photo, and any previews from this device and the server. This can&apos;t be undone.
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  Keep my plan
                </Button>
                <Button variant="danger" onClick={doReset} loading={busy}>
                  Delete everything
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
}
