import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceFile = path.join(projectRoot, "i18n", "strings.json");
const outputFile = path.join(projectRoot, "i18n", "translations.generated.json");

const loadEnvFile = async (filePath) => {
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
    // ignore missing env files
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadEnv = async () => {
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, ".env"));
};

const extractJson = (raw) => {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
};

const translateEntry = async ({ text, context }, model, apiKey) => {
  const prompt = [
    "Translate this from English to Swedish and Simplified Chinese.",
    "These are UI titles, labels, and placeholders for a web app used as an admin portal.",
    "Use concise, professional terminology.",
    "Keep brand names, product names, emails, URLs, and tokens inside {braces} unchanged.",
    context ? `Context: ${context}.` : null,
    'Return JSON only with keys "sv" and "zh-Hans".',
    `Text: "${text}"`,
  ]
    .filter(Boolean)
    .join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  const outputText =
    payload.output_text ||
    payload.output?.[0]?.content?.[0]?.text ||
    payload.choices?.[0]?.message?.content ||
    "";
  const parsed = extractJson(outputText);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Unable to parse translation JSON for "${text}".`);
  }

  if (!parsed.sv || !parsed["zh-Hans"]) {
    throw new Error(`Missing expected keys in translation for "${text}".`);
  }

  return {
    sv: String(parsed.sv),
    "zh-Hans": String(parsed["zh-Hans"]),
  };
};

const run = async () => {
  await loadEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.2";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const source = JSON.parse(await fs.readFile(sourceFile, "utf8"));
  const entries = source.strings ?? [];

  const output = {
    sv: {},
    "zh-Hans": {},
  };

  for (const entry of entries) {
    const { key, text, context } = entry;
    if (!key || !text) continue;
    console.log(`Translating ${key}...`);
    const translated = await translateEntry({ text, context }, model, apiKey);
    output.sv[key] = translated.sv;
    output["zh-Hans"][key] = translated["zh-Hans"];
    await sleep(150);
  }

  await fs.writeFile(outputFile, JSON.stringify(output, null, 2));
  console.log(`Translations saved to ${outputFile}`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
