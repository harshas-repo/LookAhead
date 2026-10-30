"use client";

/**
 * SessionGate — guards the inner journey pages.
 *
 * Inner screens need an existing anonymous session. If there isn't one (or the
 * stored one expired), we send the user back to the welcome screen rather than
 * showing an empty shell.
 */

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session-context";
import { Header } from "@/components/Header";
import { Spinner } from "@/components/ui";

export function SessionGate({ children }: { children: ReactNode }) {
  const { ready, session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) router.replace("/");
  }, [ready, session, router]);

  if (!ready || !session) {
    return (
      <>
        <Header />
        <main className="shell grid place-items-center py-32 text-warmgray">
          <span className="flex items-center gap-2 text-sm">
            <Spinner className="h-4 w-4" /> Loading your space…
          </span>
        </main>
      </>
    );
  }

  return <>{children}</>;
}
