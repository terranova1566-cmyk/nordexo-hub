# AI Prompts (Organization Guide)

This app stores prompt templates that are used across different parts of Nordexo Hub.
As the library grows, we standardize metadata so anyone can quickly understand:

- what a prompt does
- where it is used in the code/app
- how to find it later

This guide defines the required fields and conventions.

## Prompt fields (metadata)

Every prompt should have:

1. `prompt_id` (Unique key)
2. `name` (Human-readable)
3. `description` (Short summary of what it does)
4. `category` (Where in the app it belongs)
5. `address` (Where it is used in the code)

Notes:
- Only `template_text` is the actual prompt body.
- `name`, `description`, `category`, and `address` are metadata used for organization/search.

## 1) Unique key (`prompt_id`)

- Do NOT invent IDs for custom prompts.
- IDs are server-generated for custom prompts:
  - 8 characters
  - base62 alphabet (`0-9A-Za-z`)
  - uniqueness enforced by the database
- Built-in prompts use fixed, short IDs (hard-coded by the app).
- Always reference a prompt in code and tickets by `prompt_id`.

Why: readable "slug" IDs tend to collide and get renamed; we need stable identifiers.

### When you DO create IDs

There is one exception: prompts that are referenced by ID from code/scripts (seeded prompts / built-ins).
In that case we intentionally use a fixed `prompt_id` so the caller can reliably fetch it.

Rules for fixed IDs:
- 8 characters.
- Uppercase letters + digits only is preferred (easy to read and type).
- Use a stable prefix + type + numeric suffix (examples below).
- Before choosing a new ID, check Supabase to confirm it does not already exist.
- Treat fixed IDs as immutable once in use (renaming requires also updating version rows and any callers).

Recommended pattern (8 chars):
- `PPPXXXNN`
  - `PPP` = product area prefix (3 chars)
  - `XXX` = purpose/type (3 chars)
  - `NN` = sequence number (`01`, `02`, ...)

Examples already in use:
- `MTRSYS01` (Market Trends system prompt)
- `MTROCR01` (Market Trends OCR system prompt)
- `MTRDLY01` (Market Trends daily user prompt)
- `AMZDBG01` (Amazon scrape debug prompt)

## 2) Prompt name (`name`)

Rules:
- Required.
- Keep it short and specific (what the prompt is for).
- Avoid duplicating the category in the name.

Good:
- "Similar product search (extract terms)"
- "DigiDeal main image analysis"

Bad:
- "Prompt 1"
- "AI"

## 3) Summary (`description`)

Rules:
- 1 sentence if possible.
- Explain intent and expected output type (e.g. JSON schema, plain text).
- No implementation details; those belong in `address`.

Example:
- "Extracts core search terms from messy titles and returns a JSON search package."

## 4) Category (`category`)

Goal: Make prompts discoverable by where they belong in the product/app.

How it works today:
- For custom prompts, Category is stored in the database column `ai_image_edit_prompts.usage`.
  - In the UI we label this field as "Category", but the underlying column is still named `usage`.
- Category is used for organization + search in the AI Prompts UI. It should not be used as a stable lookup key.
- Built-in prompts (non-custom) currently have their category/usage text defined in code and are not editable in the UI.

Format:
- A single string path using ` / ` as a separator.
- 2-4 levels deep is usually enough.

Recommended top-level categories:
- `Product Discovery`
- `Product Manager`
- `Production`
- `DigiDeal`
- `Market Trends`
- `System`

Examples:
- `Product Discovery / Similar Search`
- `DigiDeal / Deals Manager / Supplier Data`
- `Production / Queue / Image Search`
- `System / Indexing / Meilisearch`

Backfill rule:
- If you are unsure, pick the best top-level category and one subcategory.
- Refine later; consistency matters more than perfection.

### Current categories in this repo

Examples of categories already used in production:
- `Market Trends / Reporting / System`
- `Market Trends / Reporting / OCR System`
- `Market Trends / Reporting / Daily Report (Site)`
- `Market Trends / Reporting / Daily Retry (Minimal JSON)`
- `Market Trends / Reporting / Weekly Summary (Site)`
- `Market Trends / Reporting / Weekly Summary (All Websites)`
- `Product Discovery / Amazon / Scrape Debug`

### If you cannot categorize within existing categories

Use the same logic and extend the tree:
1. Pick the closest top-level category by where the feature lives in the UI/workflow.
2. Add one subcategory that matches the page/feature name (e.g. `Similar Search`, `Draft Explorer`, `Pricing`).
3. Add a third level only when it clarifies a distinct workflow step (e.g. `Supplier Data`, `OCR`, `Retry`).

Avoid:
- Version suffixes in Category (`_v1`, `_v2`). Use version history for `template_text` instead.
- Overly deep trees (more than 4 levels).

If you add a new top-level category, update this guide so the team stays aligned.

## 5) Address (`address`)

Goal: Point to the exact place(s) in the repo where the prompt is used.

Format:
- Repo-relative path(s), optionally with a suffix for clarity:
  - `path/to/file.ts`
  - `path/to/file.ts#functionName`
- If used in multiple places, use multiple lines (one address per line).

Examples:
- `app/api/settings/ai-image-edit/route.ts`
- `app/api/discovery/similar-search/route.ts#buildPrompt`
- `node-tools/image-edit/worker.ts`

Do not:
- put secrets here
- put URLs to external services unless they are stable docs links

## Version history

- Version history tracks changes to `template_text` only.
- Metadata edits (name/category/address/description) should not create a new version.
- Use "Revert" to roll back `template_text` to a previous version.

## How to add a new prompt (workflow)

1. Click `Add New` in **AI Prompts**.
2. Set `name` and `description`, then save.
3. In the editor metadata, set:
   - `category` (where it belongs)
   - `address` (where it will be used)
4. Paste/edit `template_text`, then save.

## Backfilling existing prompts

For older prompts missing metadata:

- Add a reasonable `category` path.
- Add at least one `address` pointing to where it is used (or where you plan to use it).
- Keep `description` short and factual.

## Notes for Codex / automated edits

When Codex adds prompts:
- Prefer creating a custom prompt via the UI/API and let the server generate `prompt_id`.
- Only create a fixed `prompt_id` if code/scripts must reference it by ID.
- If Codex cannot find an existing category, extend the category tree using the rules above and keep it consistent with existing naming.
