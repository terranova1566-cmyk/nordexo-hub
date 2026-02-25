insert into public.partner_email_macro_registry (
  macro_key,
  label,
  description,
  data_source,
  formatter,
  fallback_value,
  is_required,
  is_deprecated,
  is_active
)
values
  (
    'order_content_list',
    'Order content list',
    'Order products listed as one row per item: quantity x title.',
    'variables.order_content_list',
    'trim',
    null,
    false,
    false,
    true
  )
on conflict (macro_key) do update
set
  label = excluded.label,
  description = excluded.description,
  data_source = excluded.data_source,
  formatter = excluded.formatter,
  fallback_value = excluded.fallback_value,
  is_required = excluded.is_required,
  is_deprecated = excluded.is_deprecated,
  is_active = excluded.is_active;
