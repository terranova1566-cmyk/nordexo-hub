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
    'orders_id',
    'Order ID',
    'Internal order UUID.',
    'variables.orders_id',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'orders_number',
    'Order number',
    'Marketplace/customer-facing order number.',
    'variables.orders_number',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'orders_date',
    'Order date',
    'Primary order date used in communication templates.',
    'variables.orders_date',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'orders_transaction_date',
    'Order transaction date',
    'Order transaction date (YYYY-MM-DD when available).',
    'variables.orders_transaction_date',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'orders_ship_date',
    'Order ship date',
    'Shipping date for the order (YYYY-MM-DD when available).',
    'variables.orders_ship_date',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'orders_date_shipped',
    'Order date shipped',
    'Alias for the order shipping date.',
    'variables.orders_date_shipped',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'orders_customer_name',
    'Order customer name',
    'Customer full name for the order.',
    'variables.orders_customer_name',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'orders_customer_email',
    'Order customer email',
    'Customer email address for the order.',
    'variables.orders_customer_email',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'orders_status',
    'Order status',
    'Current order status string.',
    'variables.orders_status',
    'trim|lower',
    null,
    false,
    false,
    true
  ),
  (
    'platform_id',
    'Platform ID',
    'Partner platform/sales channel identifier from the order.',
    'variables.platform_id',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'platform_name',
    'Platform name',
    'Partner platform/sales channel display name.',
    'variables.platform_name',
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

update public.partner_email_macro_registry
set
  is_deprecated = true,
  updated_at = now()
where macro_key in (
  'order_id',
  'order_number',
  'transaction_date',
  'date_shipped',
  'ship_date',
  'customer_name',
  'customer_email',
  'sales_channel_id',
  'sales_channel_name',
  'platform',
  'order_status'
)
  and is_deprecated is distinct from true;
