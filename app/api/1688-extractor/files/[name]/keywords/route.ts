import { NextResponse } from "next/server";
import path from "node:path";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateQueueKeywordsForFile } from "@/lib/queue-keywords";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { name } = await params;
  let decodedName = "";
  try {
    decodedName = decodeURIComponent(name);
  } catch {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  const safeName = path.basename(decodedName);
  if (!safeName || safeName !== decodedName) {
    return NextResponse.json({ error: "Invalid file name." }, { status: 400 });
  }

  try {
    const result = await generateQueueKeywordsForFile(safeName, {
      mode: "full",
    });
    return NextResponse.json(
      {
        ...result,
        cached: true,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    const message = (error as Error).message || "Unable to build keywords.";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
