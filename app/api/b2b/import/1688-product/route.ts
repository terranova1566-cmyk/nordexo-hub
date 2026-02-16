import { NextResponse } from "next/server";
import { requireB2BInternal } from "@/lib/b2b/server/auth";
import { fetch1688OfferDetail, normalize1688OfferToCandidate } from "@/lib/b2b/scrapers/1688";
import { createCandidateFrom1688 } from "@/lib/b2b/services/candidates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireB2BInternal();
  if (!auth.ok) return auth.response;

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const projectId =
    typeof payload?.project_id === "string" ? payload.project_id.trim() : "";
  const url = typeof payload?.url === "string" ? payload.url.trim() : "";

  if (!projectId) {
    return NextResponse.json({ error: "Missing project_id." }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ error: "Missing url." }, { status: 400 });
  }

  const scrapeResult = fetch1688OfferDetail({ url });
  if (!scrapeResult.ok) {
    return NextResponse.json(
      { error: scrapeResult.error },
      { status: 500 }
    );
  }

  const normalized = normalize1688OfferToCandidate(scrapeResult.data);

  try {
    const id = await createCandidateFrom1688(auth.supabase, {
      project_id: projectId,
      source_url: url,
      scrape: scrapeResult.data,
      normalized,
      created_by: auth.user.id,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to import product." },
      { status: 500 }
    );
  }
}

