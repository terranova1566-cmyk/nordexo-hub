-- Seed Product Collection built-in prompt for AI image edit archive.

insert into public.ai_image_edit_prompts (
  prompt_id,
  name,
  usage,
  description,
  address,
  template_text
)
values (
  'PRDCOL01',
  'Product Collection Prompt',
  'Product collection image composition',
  'Used when combining 2-4 selected product images into one white-background collection image.',
  'Draft Explorer > Edit ChatGPT/Gemini > Product Collection',
  $prompt$
You are given ONE reference image that is a contact-sheet composition of 2-4 product variant images.

INPUT FORMAT (CRITICAL):
- The input is already arranged as 750x750 tiles on a pure white canvas.
- Each tile represents one product variant that must be included in the final output.
- Use the input as source-of-truth for product identity, color, shape, and details.

TASK:
Create one high-quality e-commerce collection image that presents all shown variants together.

COMPOSITION RULES:
1. Keep a 100% pure white background (#FFFFFF) across the full final image.
2. Include every variant from the input exactly once.
3. Arrange products in a balanced, even, centralized composition.
4. Keep all products fully visible (no cut-offs, no overlaps that hide key parts).
5. Maintain realistic proportions and consistent visual scale.
6. Keep the layout clean and premium (no clutter, no extra props, no text overlays).

QUALITY RULES:
- Photorealistic product rendering only.
- Preserve product fidelity from the input tiles.
- No stylized/cartoon/illustration output.

FINAL OUTPUT:
- Exact size: 1500 x 1500 pixels.
- Single final image only.

ADDITIONAL GUIDANCE (optional):
{{INSERT_ADDITIONAL_GUIDANCE_HERE}}
$prompt$
)
on conflict (prompt_id) do nothing;

insert into public.ai_image_edit_prompt_versions (prompt_id, template_text)
select
  'PRDCOL01',
  $prompt$
You are given ONE reference image that is a contact-sheet composition of 2-4 product variant images.

INPUT FORMAT (CRITICAL):
- The input is already arranged as 750x750 tiles on a pure white canvas.
- Each tile represents one product variant that must be included in the final output.
- Use the input as source-of-truth for product identity, color, shape, and details.

TASK:
Create one high-quality e-commerce collection image that presents all shown variants together.

COMPOSITION RULES:
1. Keep a 100% pure white background (#FFFFFF) across the full final image.
2. Include every variant from the input exactly once.
3. Arrange products in a balanced, even, centralized composition.
4. Keep all products fully visible (no cut-offs, no overlaps that hide key parts).
5. Maintain realistic proportions and consistent visual scale.
6. Keep the layout clean and premium (no clutter, no extra props, no text overlays).

QUALITY RULES:
- Photorealistic product rendering only.
- Preserve product fidelity from the input tiles.
- No stylized/cartoon/illustration output.

FINAL OUTPUT:
- Exact size: 1500 x 1500 pixels.
- Single final image only.

ADDITIONAL GUIDANCE (optional):
{{INSERT_ADDITIONAL_GUIDANCE_HERE}}
$prompt$
where not exists (
  select 1
  from public.ai_image_edit_prompt_versions
  where prompt_id = 'PRDCOL01'
);
