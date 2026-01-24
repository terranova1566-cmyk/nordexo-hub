import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const productId = searchParams.get("productId")?.trim();

  if (!productId) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  }

  const { data: product, error: productError } = await supabase
    .from("digideal_products")
    .select(
      [
        "product_id",
        "listing_title",
        "title_h1",
        "product_slug",
        "prodno",
        "seller_name",
        "status",
        "primary_image_url",
        "image_urls",
        "description_html",
      ].join(",")
    )
    .eq("product_id", productId)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  const { data: analysis, error: analysisError } = await supabase
    .from("digideal_content_analysis")
    .select(
      [
        "product_id",
        "status",
        "text_analysis",
        "main_image_analysis",
        "contact_sheet_analysis",
        "images",
        "main_image_local_url",
        "main_image_url",
        "contact_sheet_local_url",
        "last_run_at",
        "attempts",
        "last_error",
      ].join(",")
    )
    .eq("product_id", productId)
    .maybeSingle();

  if (analysisError) {
    return NextResponse.json({ error: analysisError.message }, { status: 500 });
  }

  return NextResponse.json({
    product: product ?? null,
    analysis: analysis ?? null,
  });
}
