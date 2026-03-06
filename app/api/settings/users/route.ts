import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

type Locale = "en" | "sv" | "zh-Hans";
type RoleKey = "admin" | "external_partner" | "employee";
type RoleLabel = "Admin" | "External Partner" | "Employee";

const ROLE_LABELS: Record<RoleKey, RoleLabel> = {
  admin: "Admin",
  external_partner: "External Partner",
  employee: "Employee",
};

const ROLE_ADMIN_ACCESS: Record<RoleKey, boolean> = {
  admin: true,
  external_partner: false,
  employee: true,
};

const isLocale = (value: unknown): value is Locale =>
  value === "en" || value === "sv" || value === "zh-Hans";

const isRoleKey = (value: unknown): value is RoleKey =>
  value === "admin" || value === "external_partner" || value === "employee";

const inferRoleKey = (value: unknown, isAdmin: boolean): RoleKey => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "admin") return "admin";
  if (normalized === "employee") return "employee";
  if (normalized === "external_partner" || normalized === "external") {
    return "external_partner";
  }

  return isAdmin ? "admin" : "external_partner";
};

const mapRoleLabelToKey = (value: unknown): RoleKey | null => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "admin") return "admin";
  if (normalized === "external_partner" || normalized === "external") {
    return "external_partner";
  }
  if (normalized === "employee") return "employee";
  return null;
};

const getAdminClient = () => {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const mapUserRecord = (
  authUser: {
    id: string;
    email?: string | null;
    created_at?: string | null;
    last_sign_in_at?: string | null;
  },
  settings: {
    full_name?: string | null;
    company_name?: string | null;
    preferred_locale?: string | null;
    is_admin?: boolean | null;
    job_title?: string | null;
  } | null
) => {
  const roleKey = inferRoleKey(settings?.job_title, Boolean(settings?.is_admin));

  return {
    user_id: authUser.id,
    email: authUser.email ?? null,
    full_name: settings?.full_name ?? "",
    company_name: settings?.company_name ?? "",
    preferred_locale: isLocale(settings?.preferred_locale)
      ? settings?.preferred_locale
      : null,
    role_key: roleKey,
    role_label: ROLE_LABELS[roleKey],
    has_admin_access: ROLE_ADMIN_ACCESS[roleKey],
    created_at: authUser.created_at ?? null,
    last_sign_in_at: authUser.last_sign_in_at ?? null,
  };
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  const list = await adminClient.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (list.error) {
    return NextResponse.json({ error: list.error.message }, { status: 500 });
  }

  const authUsers = list.data.users ?? [];
  const userIds = authUsers.map((user) => user.id).filter(Boolean);

  const settingsResult = userIds.length
    ? await adminClient
        .from("partner_user_settings")
        .select("user_id, full_name, company_name, preferred_locale, is_admin, job_title")
        .in("user_id", userIds)
    : { data: [], error: null as { message: string } | null };

  if (settingsResult.error) {
    return NextResponse.json(
      { error: settingsResult.error.message },
      { status: 500 }
    );
  }

  const settingsByUserId = new Map(
    (settingsResult.data ?? []).map((entry) => [entry.user_id, entry])
  );

  const users = authUsers
    .map((user) => {
      const settings = settingsByUserId.get(user.id) ?? null;
      return mapUserRecord(user, settings);
    })
    .sort((left, right) => {
      const leftTs = new Date(left.created_at ?? 0).getTime();
      const rightTs = new Date(right.created_at ?? 0).getTime();
      return rightTs - leftTs;
    });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: {
    email?: unknown;
    password?: unknown;
    full_name?: unknown;
    company_name?: unknown;
    preferred_locale?: unknown;
    role_key?: unknown;
    role_label?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const fullName = String(payload.full_name ?? "").trim();
  const companyName = String(payload.company_name ?? "").trim();
  const preferredLocale = isLocale(payload.preferred_locale)
    ? payload.preferred_locale
    : null;

  const roleKey = isRoleKey(payload.role_key)
    ? payload.role_key
    : mapRoleLabelToKey(payload.role_label);

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (!roleKey) {
    return NextResponse.json(
      { error: "Role must be one of: admin, external_partner, employee." },
      { status: 400 }
    );
  }

  const createResult = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || null,
      company_name: companyName || null,
      preferred_locale: preferredLocale,
    },
  });

  if (createResult.error || !createResult.data.user) {
    return NextResponse.json(
      { error: createResult.error?.message || "Unable to create user." },
      { status: 500 }
    );
  }

  const createdUser = createResult.data.user;
  const settingsPayload = {
    user_id: createdUser.id,
    full_name: fullName || null,
    company_name: companyName || null,
    preferred_locale: preferredLocale,
    job_title: ROLE_LABELS[roleKey],
    is_admin: ROLE_ADMIN_ACCESS[roleKey],
  };

  const settingsResult = await adminClient
    .from("partner_user_settings")
    .upsert(settingsPayload, { onConflict: "user_id" })
    .select("user_id, full_name, company_name, preferred_locale, is_admin, job_title")
    .maybeSingle();

  if (settingsResult.error) {
    await adminClient.auth.admin.deleteUser(createdUser.id).catch(() => null);
    return NextResponse.json(
      { error: settingsResult.error.message },
      { status: 500 }
    );
  }

  const user = mapUserRecord(createdUser, settingsResult.data ?? null);
  return NextResponse.json({ user }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  let payload: {
    user_id?: unknown;
    email?: unknown;
    password?: unknown;
    full_name?: unknown;
    company_name?: unknown;
    preferred_locale?: unknown;
    role_key?: unknown;
    role_label?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const userId = String(payload.user_id ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const fullName = String(payload.full_name ?? "").trim();
  const companyName = String(payload.company_name ?? "").trim();
  const preferredLocale = isLocale(payload.preferred_locale)
    ? payload.preferred_locale
    : null;
  const roleKey = isRoleKey(payload.role_key)
    ? payload.role_key
    : mapRoleLabelToKey(payload.role_label);

  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  if (password.length > 0 && password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (!roleKey) {
    return NextResponse.json(
      { error: "Role must be one of: admin, external_partner, employee." },
      { status: 400 }
    );
  }

  const existingResult = await adminClient.auth.admin.getUserById(userId);
  if (existingResult.error) {
    const status = existingResult.error.status || 500;
    return NextResponse.json({ error: existingResult.error.message }, { status });
  }
  if (!existingResult.data.user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const existingUser = existingResult.data.user;
  const currentMetadata =
    existingUser.user_metadata && typeof existingUser.user_metadata === "object"
      ? (existingUser.user_metadata as Record<string, unknown>)
      : {};

  const updateResult = await adminClient.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    ...(password.length > 0 ? { password } : {}),
    user_metadata: {
      ...currentMetadata,
      full_name: fullName || null,
      company_name: companyName || null,
      preferred_locale: preferredLocale,
    },
  });

  if (updateResult.error || !updateResult.data.user) {
    return NextResponse.json(
      { error: updateResult.error?.message || "Unable to update user." },
      { status: 500 }
    );
  }

  const settingsResult = await adminClient
    .from("partner_user_settings")
    .upsert(
      {
        user_id: userId,
        full_name: fullName || null,
        company_name: companyName || null,
        preferred_locale: preferredLocale,
        job_title: ROLE_LABELS[roleKey],
        is_admin: ROLE_ADMIN_ACCESS[roleKey],
      },
      { onConflict: "user_id" }
    )
    .select("user_id, full_name, company_name, preferred_locale, is_admin, job_title")
    .maybeSingle();

  if (settingsResult.error) {
    return NextResponse.json(
      { error: settingsResult.error.message },
      { status: 500 }
    );
  }

  const user = mapUserRecord(updateResult.data.user, settingsResult.data ?? null);
  return NextResponse.json({ user });
}
