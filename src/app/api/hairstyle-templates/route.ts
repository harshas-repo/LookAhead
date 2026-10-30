/**
 * GET /api/hairstyle-templates — the verified provider template catalog.
 *
 * IDs come straight from the provider (or the labelled mock catalog). This is
 * secret-free and safe to expose; the API key never leaves the server.
 */

import { NextResponse } from "next/server";
import { getTemplates } from "@/lib/decision/catalog";
import { fromError, providerMode } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const mode = providerMode();
    const templates = await getTemplates(mode);
    return NextResponse.json({ mode, templates });
  } catch (err) {
    return fromError(err);
  }
}
