import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { mergeExtractorFiles } from "@/lib/1688-extractor";

export const runtime = "nodejs";

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { error: null };
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const names = Array.isArray(body?.names)
    ? body.names.map((name: unknown) => String(name || "").trim()).filter(Boolean)
    : [];
  if (names.length < 2) {
    return NextResponse.json(
      { error: "Select at least two files to merge." },
      { status: 400 }
    );
  }

  try {
    const result = mergeExtractorFiles(
      names,
      typeof body?.baseName === "string" ? body.baseName : null
    );
    if (!result) {
      return NextResponse.json({ error: "Unable to merge files." }, { status: 400 });
    }
    return NextResponse.json({ item: result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Merge failed." },
      { status: 500 }
    );
  }
}
