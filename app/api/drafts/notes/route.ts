import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { DRAFT_ROOT, resolveDraftPath } from "@/lib/drafts";

export const runtime = "nodejs";

const NOTE_FILE_NAME = ".draft-product-notes.json";
const MAX_NOTE_LENGTH = 6000;

type DraftNoteRecord = {
  note: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: {
    id?: string | null;
    email?: string | null;
  } | null;
};

type DraftNotePayload = {
  version: number;
  notes: Record<string, DraftNoteRecord>;
};

const isWithinDraftRoot = (absolutePath: string) =>
  absolutePath === DRAFT_ROOT || absolutePath.startsWith(`${DRAFT_ROOT}${path.sep}`);

const normalizeSpu = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase();

const readNotePayload = (filePath: string): DraftNotePayload => {
  if (!fs.existsSync(filePath)) {
    return { version: 1, notes: {} };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DraftNotePayload>;
    const notes =
      parsed && parsed.notes && typeof parsed.notes === "object"
        ? (parsed.notes as Record<string, DraftNoteRecord>)
        : {};
    return {
      version: 1,
      notes,
    };
  } catch {
    return { version: 1, notes: {} };
  }
};

const writeNotePayload = (filePath: string, payload: DraftNotePayload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }
};

const requireAdmin = async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
};

const resolveRunRoot = (run: string) => {
  const normalizedRun = String(run || "").trim();
  if (!normalizedRun) return null;
  const absolute = resolveDraftPath(normalizedRun);
  if (!absolute || !isWithinDraftRoot(absolute)) return null;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return null;
  return absolute;
};

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const run = String(url.searchParams.get("run") || "").trim();
  const spu = normalizeSpu(url.searchParams.get("spu"));

  if (!run) {
    return NextResponse.json({ error: "Missing run." }, { status: 400 });
  }

  const runRoot = resolveRunRoot(run);
  if (!runRoot) {
    return NextResponse.json({ error: "Invalid run." }, { status: 400 });
  }

  const noteFile = path.join(runRoot, NOTE_FILE_NAME);
  const payload = readNotePayload(noteFile);

  if (!spu) {
    return NextResponse.json({
      run,
      notes: payload.notes,
    });
  }

  return NextResponse.json({
    run,
    spu,
    note: payload.notes[spu] ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | {
        run?: unknown;
        spu?: unknown;
        note?: unknown;
      }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const run = String(body.run || "").trim();
  const spu = normalizeSpu(body.spu);
  const note = String(body.note ?? "")
    .replace(/\r\n/g, "\n")
    .trim();

  if (!run || !spu) {
    return NextResponse.json({ error: "Missing run or SPU." }, { status: 400 });
  }

  const runRoot = resolveRunRoot(run);
  if (!runRoot) {
    return NextResponse.json({ error: "Invalid run." }, { status: 400 });
  }

  if (note.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Note is too long (max ${MAX_NOTE_LENGTH} chars).` },
      { status: 400 }
    );
  }

  const noteFile = path.join(runRoot, NOTE_FILE_NAME);
  const payload = readNotePayload(noteFile);
  const now = new Date().toISOString();

  let savedNote: DraftNoteRecord | null = null;
  if (!note) {
    delete payload.notes[spu];
  } else {
    const existing = payload.notes[spu];
    savedNote = {
      note,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      updatedBy: {
        id: auth.user.id,
        email: auth.user.email ?? null,
      },
    };
    payload.notes[spu] = savedNote;
  }

  writeNotePayload(noteFile, payload);

  return NextResponse.json({
    ok: true,
    run,
    spu,
    note: savedNote,
  });
}
