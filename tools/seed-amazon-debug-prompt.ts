import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_AMAZON_DEBUG_PROMPT_TEMPLATE,
  DEFAULT_AMAZON_DEBUG_PROMPT_ID,
} from "@/lib/amazon/debug-ai-prompt";

const loadEnvFile = async (filePath: string) => {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    contents.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch {
    // ignore
  }
};

const loadEnv = async () => {
  const root = process.cwd();
  await loadEnvFile(path.join(root, ".env.local"));
  await loadEnvFile(path.join(root, ".env"));
};

async function main() {
  await loadEnv();

  const promptId =
    String(process.env.AMAZON_DEBUG_PROMPT_ID || "").trim() ||
    DEFAULT_AMAZON_DEBUG_PROMPT_ID;
  const name =
    String(process.env.AMAZON_DEBUG_PROMPT_NAME || "").trim() ||
    "Amazon scrape error diagnosis (AI)";
  const category =
    String(process.env.AMAZON_DEBUG_PROMPT_CATEGORY || "").trim() ||
    "Product Discovery / Amazon / Scrape Debug";
  const description =
    String(process.env.AMAZON_DEBUG_PROMPT_DESCRIPTION || "").trim() ||
    "Template for gpt-4o-mini to classify Amazon scrape failures using page snippets. Returns JSON.";
  const templateText =
    String(process.env.AMAZON_DEBUG_PROMPT_TEMPLATE || "").trim() ||
    DEFAULT_AMAZON_DEBUG_PROMPT_TEMPLATE;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE in env.");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  // If it already exists by prompt_id, leave it alone (do not overwrite edits).
  const { data: existing, error: existingError } = await supabase
    .from("ai_image_edit_prompts")
    .select("prompt_id")
    .eq("prompt_id", promptId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    throw new Error(existingError.message);
  }
  if (existing?.prompt_id) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          created: false,
          prompt_id: existing.prompt_id,
          category,
          message: "Prompt already exists (matched by prompt_id).",
        },
        null,
        2
      )
    );
    return;
  }

  const { data: created, error: insertError } = await supabase
    .from("ai_image_edit_prompts")
    .insert({
      prompt_id: promptId,
      name,
      usage: category,
      description,
      template_text: templateText,
    })
    .select("prompt_id")
    .single();

  if (insertError || !created?.prompt_id) {
    throw new Error(insertError?.message || "Failed to insert prompt.");
  }

  const { error: versionError } = await supabase
    .from("ai_image_edit_prompt_versions")
    .insert([{ prompt_id: promptId, template_text: templateText }]);
  if (versionError) {
    throw new Error(versionError.message);
  }

  console.log(
    JSON.stringify(
      { ok: true, created: true, prompt_id: promptId, category, name },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(String((err as Error)?.message ?? err));
  process.exit(1);
});
