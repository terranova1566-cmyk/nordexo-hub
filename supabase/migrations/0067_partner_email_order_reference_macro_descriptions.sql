update public.partner_email_macro_registry
set
  label = case
    when macro_key in ('orders_id', 'order_id') then 'Order reference'
    when macro_key in ('orders_number', 'order_number') then 'Order number'
    else label
  end,
  description = 'Preferred order reference: sales channel order ID, then marketplace order ID, then fallback order number.',
  is_active = true,
  updated_at = now()
where macro_key in ('orders_id', 'orders_number', 'order_id', 'order_number');
