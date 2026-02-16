// Seeded prompt ID in `public.ai_image_edit_prompts` (see tools/seed-amazon-debug-prompt.ts).
export const DEFAULT_AMAZON_DEBUG_PROMPT_ID = "AMZDBG01";

export const DEFAULT_AMAZON_DEBUG_PROMPT_TEMPLATE = [
  "You are debugging an Amazon scraping failure.",
  "Analyze the provided metadata and page snippets.",
  "Important: Do NOT suggest CAPTCHA bypassing/solving, fingerprinting, proxy/residential IP tactics, user-agent spoofing, or any other evasion methods.",
  "Only suggest compliant next steps (e.g. use official APIs, obtain permission, reduce/stop scraping when blocked, or use an authorized scraping provider).",
  "Return JSON only with keys:",
  'page_type (one of: \"product_page\",\"captcha_or_robot_check\",\"blocked_or_rate_limited\",\"blank_or_error_page\",\"unknown\"),',
  "likely_issue, confidence (0-1), key_signals (array), next_steps (array), hypotheses (array of 5 short items).",
  "",
  "Error type: {{error_type}}",
  "Provider: {{provider}}",
  "Code: {{code}}",
  "Message: {{message}}",
  "URL: {{url}}",
  "",
  "HTTP status: {{http_status}}",
  "Final URL: {{final_url}}",
  "Content-Type: {{content_type}}",
  "Detected block: {{blocked}}",
  "Title: {{title}}",
  "Text snippet: {{text_snippet}}",
  "HTML snippet: {{html_snippet}}",
].join("\n");

export const renderPromptTemplate = (template: string, vars: Record<string, string>) =>
  String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = vars[String(key)] ?? "";
    return String(v);
  });
