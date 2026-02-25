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
    'order_id',
    'Order ID',
    'Internal order UUID.',
    'variables.order_id',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'order_number',
    'Order number',
    'Marketplace/customer-facing order number.',
    'variables.order_number',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'transaction_date',
    'Transaction date',
    'Order transaction date (YYYY-MM-DD when available).',
    'variables.transaction_date',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'date_shipped',
    'Date shipped',
    'Shipping date (YYYY-MM-DD when available).',
    'variables.date_shipped',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'ship_date',
    'Ship date',
    'Alias for date_shipped.',
    'variables.ship_date',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'customer_name',
    'Customer name',
    'Order customer full name.',
    'variables.customer_name',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'customer_email',
    'Customer email',
    'Order customer email address.',
    'variables.customer_email',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'platform',
    'Platform',
    'Order platform or sales channel display name.',
    'variables.platform',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'sales_channel_name',
    'Sales channel name',
    'Sales channel readable name.',
    'variables.sales_channel_name',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'sales_channel_id',
    'Sales channel ID',
    'Sales channel code/id from the order.',
    'variables.sales_channel_id',
    'trim',
    null,
    false,
    false,
    true
  ),
  (
    'order_status',
    'Order status',
    'Current order status string.',
    'variables.order_status',
    'trim|lower',
    null,
    false,
    false,
    true
  )
on conflict (macro_key) do nothing;
