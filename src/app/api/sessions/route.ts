/**
 * POST /api/sessions — create a new anonymous session.
 *
 * Returns the session id plus the unpredictable ownership token exactly once. The
 * client stores both (localStorage) and presents the token on subsequent calls.
 */

import { NextResponse } from "next/server";
import { createSession } from "@/lib/store";
import { getConfig } from "@/lib/config";
import { fromError, providerMode } from "@/lib/api/http";
import { publicSession } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    // Session creation is free (no provider credits), so the app stays browsable without
    // a pass. The credit-spending live calls (hair-analysis, previews) enforce requireAccess.
    const session = await createSession();
    const cfg = getConfig();
    return NextResponse.json(
      {
        // The token is returned only here, at creation.
        token: session.token,
        session: publicSession(session, providerMode(), cfg.limits.maxPreviewsPerSession)
      },
      { status: 201 }
    );
  } catch (err) {
    return fromError(err);
  }
}
