import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Locale, defaultLocale } from "@/lib/i18n/source";

const allowedLocales: Locale[] = ["en", "sv", "zh-Hans"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLocale = searchParams.get("locale") ?? defaultLocale;
  const locale = allowedLocales.includes(requestedLocale as Locale)
    ? (requestedLocale as Locale)
    : defaultLocale;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("portal_ui_translations")
    .select("key, value")
    .eq("locale", locale);

  if (error) {
    return NextResponse.json(
      { error: "Unable to load translations." },
      { status: 500 }
    );
  }

  const translations = (data ?? []).reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  return NextResponse.json({ locale, translations });
}
