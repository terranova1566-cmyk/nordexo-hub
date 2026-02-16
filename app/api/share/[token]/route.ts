import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServiceSupabase } from "@/lib/b2b/server/admin";
import { sanitizeCandidateForShare, sanitizeLookbookItemForShare } from "@/lib/b2b/share/sanitize";

export const runtime = "nodejs";

const nowIso = () => new Date().toISOString();

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Server is missing Supabase service role credentials." },
      { status: 500 }
    );
  }

  const { token } = await context.params;
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const { data: link, error: linkError } = await admin
    .from("b2b_share_links")
    .select("id, token, type, entity_id, permissions, expires_at, revoked_at, sanitized_view_config")
    .eq("token", cleanToken)
    .maybeSingle();

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }
  if (!link?.id || link.revoked_at) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Link expired." }, { status: 404 });
  }

  // Update last_accessed_at (best-effort).
  admin
    .from("b2b_share_links")
    .update({ last_accessed_at: nowIso() })
    .eq("id", link.id)
    .then(() => null);

  const cookieStore = await cookies();
  const sessionId = cookieStore.get("nx_b2b_share_session")?.value ?? null;

  const buildSelectionsMap = async (itemIds: { candidates: string[]; lookbookItems: string[] }) => {
    if (!sessionId) return { candidates: {}, lookbook_items: {} } as const;
    const { data } = await admin
      .from("b2b_customer_selections")
      .select("product_candidate_id, lookbook_item_id, selection_state, comment")
      .eq("share_link_id", link.id)
      .eq("external_user_session_id", sessionId);

    const candidateMap: Record<string, { selection_state: string; comment: string | null }> = {};
    const lookbookMap: Record<string, { selection_state: string; comment: string | null }> = {};

    (data ?? []).forEach((row: any) => {
      if (row.product_candidate_id && itemIds.candidates.includes(row.product_candidate_id)) {
        candidateMap[row.product_candidate_id] = {
          selection_state: row.selection_state,
          comment: row.comment ?? null,
        };
      }
      if (row.lookbook_item_id && itemIds.lookbookItems.includes(row.lookbook_item_id)) {
        lookbookMap[row.lookbook_item_id] = {
          selection_state: row.selection_state,
          comment: row.comment ?? null,
        };
      }
    });

    return { candidates: candidateMap, lookbook_items: lookbookMap } as const;
  };

	  if (link.type === "project") {
	    const { data: project, error: projectError } = await admin
	      .from("b2b_projects")
	      .select(
	        "id, title, description, brief, currency, exchange_rate_cny, margin_percent_default, margin_fixed_default, customer:b2b_customers(id, name, main_currency)"
	      )
	      .eq("id", link.entity_id)
	      .maybeSingle();

    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500 });
    }
    if (!project?.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const { data: candidates, error: candError } = await admin
      .from("b2b_product_candidates")
      .select(
        "id, title, images, moq, final_moq, final_lead_time_days, final_price_without_logo_cny, final_price_with_logo_cny, branding_costs_cny, packaging_costs_cny, margin_percent_override, margin_fixed_override"
      )
      .eq("project_id", project.id)
      .eq("is_shortlisted", true)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (candError) {
      return NextResponse.json({ error: candError.message }, { status: 500 });
    }

    const items = (candidates ?? []).map((candidate: any) =>
      sanitizeCandidateForShare({ candidate, project })
    );

    const selections = await buildSelectionsMap({
      candidates: items.map((i) => i.id),
      lookbookItems: [],
    });

	    return NextResponse.json({
	      link: {
	        id: link.id,
	        type: link.type,
	        permissions: link.permissions ?? ["view"],
	        expires_at: link.expires_at ?? null,
	        sanitized_view_config: link.sanitized_view_config ?? {},
	      },
	      session: { id: sessionId },
	      project: {
	        id: project.id,
	        title: project.title ?? "Project",
	        description: project.description ?? null,
	        brief: project.brief ?? null,
	        customer: (() => {
	          const customer = Array.isArray((project as any).customer)
	            ? (project as any).customer[0]
	            : (project as any).customer;
	          return customer?.id ? { id: customer.id, name: customer.name } : null;
	        })(),
	      },
	      items,
	      selections,
	    });
	  }

	  if (link.type === "product") {
	    const { data: candidate, error: candError } = await admin
	      .from("b2b_product_candidates")
	      .select(
	        "id, title, images, moq, final_moq, final_lead_time_days, final_price_without_logo_cny, final_price_with_logo_cny, branding_costs_cny, packaging_costs_cny, margin_percent_override, margin_fixed_override, project:b2b_projects(id, title, currency, exchange_rate_cny, margin_percent_default, margin_fixed_default)"
	      )
	      .eq("id", link.entity_id)
	      .maybeSingle();

	    if (candError) {
	      return NextResponse.json({ error: candError.message }, { status: 500 });
	    }
	    const project = Array.isArray((candidate as any)?.project)
	      ? (candidate as any).project[0]
	      : (candidate as any)?.project;

	    if (!candidate?.id || !project?.id) {
	      return NextResponse.json({ error: "Not found." }, { status: 404 });
	    }

	    const item = sanitizeCandidateForShare({
	      candidate,
	      project,
	    });

    const selections = await buildSelectionsMap({
      candidates: [item.id],
      lookbookItems: [],
    });

    return NextResponse.json({
      link: {
        id: link.id,
        type: link.type,
        permissions: link.permissions ?? ["view"],
        expires_at: link.expires_at ?? null,
        sanitized_view_config: link.sanitized_view_config ?? {},
      },
      session: { id: sessionId },
      item,
      selections,
    });
  }

	  if (link.type === "lookbook") {
	    const { data: lookbook, error: lookbookError } = await admin
	      .from("b2b_supplier_lookbooks")
	      .select("id, title, description, curated_for_customer:b2b_customers(id, name)")
	      .eq("id", link.entity_id)
	      .maybeSingle();

    if (lookbookError) {
      return NextResponse.json({ error: lookbookError.message }, { status: 500 });
    }
    if (!lookbook?.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const { data: items, error: itemsError } = await admin
      .from("b2b_supplier_lookbook_items")
      .select("id, title, image_url, preview_price_cny, product_candidate_id")
      .eq("lookbook_id", lookbook.id)
      .eq("exposed_to_customer", true)
      .order("position", { ascending: true, nullsFirst: false })
      .limit(500);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const candidateIds = (items ?? [])
      .map((row: any) => row.product_candidate_id)
      .filter(Boolean) as string[];

    const candidateMap = new Map<string, any>();
    const projectMap = new Map<string, any>();

	    if (candidateIds.length > 0) {
	      const { data: candidates, error: candidatesError } = await admin
	        .from("b2b_product_candidates")
	        .select(
	          "id, title, images, moq, final_moq, final_lead_time_days, final_price_without_logo_cny, final_price_with_logo_cny, branding_costs_cny, packaging_costs_cny, margin_percent_override, margin_fixed_override, project:b2b_projects(id, currency, exchange_rate_cny, margin_percent_default, margin_fixed_default)"
	        )
	        .in("id", candidateIds);

      if (candidatesError) {
        return NextResponse.json({ error: candidatesError.message }, { status: 500 });
      }

	      (candidates ?? []).forEach((candidate: any) => {
	        const project = Array.isArray(candidate?.project) ? candidate.project[0] : candidate?.project;
	        if (!candidate?.id || !project?.id) return;
	        candidateMap.set(candidate.id, { ...candidate, project });
	        projectMap.set(project.id, project);
	      });
	    }

	    const publicItems = (items ?? []).map((row: any) => {
	      const candidate = row.product_candidate_id ? candidateMap.get(row.product_candidate_id) : null;
	      const project = candidate?.project ?? null;
	      const candidatePublic =
	        candidate && project
	          ? sanitizeCandidateForShare({ candidate, project })
	          : null;

      return sanitizeLookbookItemForShare({
        item: {
          id: row.id,
          title: row.title ?? null,
          image_url: row.image_url ?? null,
          preview_price_cny: row.preview_price_cny ?? null,
          product_candidate_id: row.product_candidate_id ?? null,
        },
        project,
        candidatePublic,
      });
    });

    const selections = await buildSelectionsMap({
      candidates: [],
      lookbookItems: publicItems.map((i) => i.id),
    });

	    return NextResponse.json({
	      link: {
	        id: link.id,
	        type: link.type,
	        permissions: link.permissions ?? ["view"],
	        expires_at: link.expires_at ?? null,
	        sanitized_view_config: link.sanitized_view_config ?? {},
	      },
	      session: { id: sessionId },
	      lookbook: {
	        id: lookbook.id,
	        title: lookbook.title ?? "Lookbook",
	        description: lookbook.description ?? null,
	        curated_for_customer: (() => {
	          const customer = Array.isArray((lookbook as any).curated_for_customer)
	            ? (lookbook as any).curated_for_customer[0]
	            : (lookbook as any).curated_for_customer;
	          return customer?.id ? { id: customer.id, name: customer.name } : null;
	        })(),
	      },
	      items: publicItems,
	      selections,
	    });
	  }

  return NextResponse.json({ error: "Not found." }, { status: 404 });
}
