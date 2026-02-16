-- Seed Market Trends daily retry prompt template into the prompt archive.
-- Idempotent: safe to run multiple times; does not overwrite existing prompts.

insert into public.ai_image_edit_prompts (prompt_id, name, usage, description, template_text)
values
  (
    'MTRTRY01',
    'Market Trends: Daily Retry (Minimal JSON)',
    'market_trends_daily_retry_v1',
    'Fallback user prompt template used when the daily Market Trends report generation returns invalid/truncated JSON. Produces minimal structured output.',
    $prompt$
The previous attempt produced invalid or truncated JSON.
Regenerate the report STRICTLY following the schema below, with minimal output.

Output rules:
- Return ONLY valid JSON.
- Do NOT include markdown.
- Do not output long URL lists. Only include URLs inside the featured items where relevant.
- Keep strings short.
- Hard limits: banner_messages<=8, header_messages<=10, themes<=8, promotions<=10, featured_products<=8, featured_categories<=8, new_to_frontpage<=8, long_running_frontpage<=8.

Schema:
{
  "site": { "provider": "string", "name": "string", "url": "string", "date": "YYYY-MM-DD" },
  "summary": "string",
  "banner_messages": ["string"],
  "header_messages": ["string"],
  "themes": ["string"],
  "promotions": ["string"],
  "featured_products": [{ "title": "string|null", "url": "string|null", "why": "string", "novelty": "new|recurring|unknown", "days_seen": "number|null" }],
  "new_to_frontpage": [{ "title": "string|null", "url": "string|null", "why": "string", "days_seen": "number|null" }],
  "long_running_frontpage": [{ "title": "string|null", "url": "string|null", "why": "string", "days_seen": "number|null" }],
  "featured_categories": [{ "title": "string|null", "url": "string|null", "why": "string" }],
  "notes": "string"
}

SITE_PROVIDER: {{SITE_PROVIDER}}
SITE_NAME: {{SITE_NAME}}
SITE_URL: {{SITE_URL}}
SCRAPE_DATE: {{SCRAPE_DATE}}

PAGE_TITLE:
{{PAGE_TITLE}}

HEADINGS:
{{HEADINGS_JSON}}

HERO_TEXTS:
{{HERO_TEXTS_JSON}}

BANNER_OCR:
{{BANNER_OCR_JSON}}

CURRENT_PRODUCT_CANDIDATES:
{{PRODUCT_CANDIDATES_JSON}}

PRODUCT_PERSISTENCE:
{{PERSISTENCE_JSON}}
$prompt$
  )
on conflict (prompt_id) do nothing;

insert into public.ai_image_edit_prompt_versions (prompt_id, template_text)
select p.prompt_id, p.template_text
from public.ai_image_edit_prompts p
where p.prompt_id = 'MTRTRY01'
  and not exists (
    select 1 from public.ai_image_edit_prompt_versions v where v.prompt_id = p.prompt_id
  );

