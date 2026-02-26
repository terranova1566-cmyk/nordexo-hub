update public.partner_email_macro_registry
set
  label = 'Online order number',
  description = 'Resolved online order reference using fallback: sales channel -> marketplace -> standard order number.',
  data_source = 'variables.orders_number',
  formatter = 'trim',
  is_required = false,
  is_deprecated = false,
  is_active = true,
  updated_at = now()
where macro_key = 'orders_number';

update public.partner_email_macro_registry
set
  label = 'Online order number (legacy alias)',
  description = 'Deprecated alias for orders_number.',
  data_source = 'variables.orders_number',
  formatter = 'trim',
  is_required = false,
  is_deprecated = true,
  is_active = false,
  updated_at = now()
where macro_key in ('orders_id', 'order_id');

update public.partner_email_macro_registry
set
  label = 'Online order number (legacy alias)',
  description = 'Deprecated alias for orders_number.',
  data_source = 'variables.orders_number',
  formatter = 'trim',
  is_required = false,
  is_deprecated = true,
  is_active = false,
  updated_at = now()
where macro_key = 'order_number';

update public.partner_email_macro_registry
set
  is_deprecated = true,
  is_active = false,
  updated_at = now()
where macro_key in ('sales_channel_order_number', 'marketplace_order_number');
