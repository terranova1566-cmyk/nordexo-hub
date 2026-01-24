create policy "partner_exports_delete"
  on public.partner_exports
  for delete
  using (auth.uid() = user_id);
