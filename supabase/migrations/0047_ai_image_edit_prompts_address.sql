-- Add address field to AI prompts for tracking where they're used.

alter table public.ai_image_edit_prompts
  add column if not exists address text;

