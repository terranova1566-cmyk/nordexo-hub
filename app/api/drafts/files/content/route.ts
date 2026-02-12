import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

const isSupportedTextFile = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".txt" || ext === ".json";
};

const assertAdmin = async () => {
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

  return { error: null as NextResponse | null };
};

const resolveAndValidate = (relativePath: string) => {
  const absolute = resolveDraftPath(relativePath);
  if (!absolute || !absolute.startsWith(`${DRAFT_ROOT}${path.sep}`)) {
    return { error: NextResponse.json({ error: "Invalid path." }, { status: 400 }) };
  }
  if (!fs.existsSync(absolute)) {
    return { error: NextResponse.json({ error: "File not found." }, { status: 404 }) };
  }
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) {
    return { error: NextResponse.json({ error: "Not a file." }, { status: 400 }) };
  }
  if (!isSupportedTextFile(absolute)) {
    return {
      error: NextResponse.json(
        { error: "Only .txt and .json files are supported." },
        { status: 400 }
      ),
    };
  }
  return { absolute, error: null as NextResponse | null };
};

export async function GET(request: Request) {
  const auth = await assertAdmin();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const relativePath = String(url.searchParams.get("path") || "").trim();
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  const resolved = resolveAndValidate(relativePath);
  if (resolved.error) return resolved.error;
  const absolutePath = resolved.absolute as string;

  const content = fs.readFileSync(absolutePath, "utf8");
  return NextResponse.json({
    path: relativePath,
    content,
  });
}

export async function POST(request: Request) {
  const auth = await assertAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const relativePath = String(body?.path || "").trim();
  const content = typeof body?.content === "string" ? body.content : null;

  if (!relativePath || content === null) {
    return NextResponse.json({ error: "Missing path or content." }, { status: 400 });
  }

  const resolved = resolveAndValidate(relativePath);
  if (resolved.error) return resolved.error;
  const absolutePath = resolved.absolute as string;

  fs.writeFileSync(absolutePath, content, "utf8");

  return NextResponse.json({ ok: true });
}
