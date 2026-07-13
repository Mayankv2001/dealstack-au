import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { cronSecret } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 3 * 1024;
const ENTITY_TYPES = new Set([
  "gift-card-offer",
  "gift-card-acceptance",
  "gift-card-product",
]);
const REASONS = new Set([
  "terms",
  "expiry",
  "acceptance",
  "value",
  "eligibility",
  "other",
]);

function fingerprint(request: NextRequest): string {
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 200) ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${cronSecret() ?? "dealstack-public-correction-v1"}|${day}|${forwarded}|${userAgent}`)
    .digest("hex");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; id: string }> }
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    return Response.json({ error: "Report is too large." }, { status: 413 });
  }
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Report is too large." }, { status: 413 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.website) return new Response(null, { status: 204 });
    const { entityType, id } = await params;
    const reason = typeof body.reason === "string" ? body.reason : "";
    const details = typeof body.details === "string" ? body.details.trim() : "";
    if (
      !ENTITY_TYPES.has(entityType) ||
      !REASONS.has(reason) ||
      details.length < 10 ||
      details.length > 2000
    ) {
      return Response.json(
        { error: "Choose a valid reason and provide 10–2000 characters." },
        { status: 400 }
      );
    }
    const db = getSupabaseAdmin();
    // The generated client cannot include migration 026 until it is approved
    // and applied, so this narrow cast is removed when types are regenerated.
    const { data, error } = await db.rpc("submit_public_correction" as "submit_card_offer_correction", {
      p_entity_type: entityType,
      p_entity_id: id,
      p_reason: reason,
      p_details: details,
      p_request_fingerprint: fingerprint(request),
    } as never);
    if (error) {
      if (error.message.includes("not publicly reportable")) {
        return Response.json({ error: "Record is no longer public." }, { status: 404 });
      }
      if (error.message.includes("Could not find the function")) {
        return Response.json(
          { error: "Reporting is awaiting the approved database rollout." },
          { status: 503 }
        );
      }
      throw new Error(error.message);
    }
    if (!data) {
      return Response.json({ error: "Too many reports. Try again later." }, { status: 429 });
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error(
      "[public-correction] submission failed:",
      error instanceof Error ? error.message : "unknown"
    );
    return Response.json({ error: "Could not submit the report." }, { status: 500 });
  }
}
