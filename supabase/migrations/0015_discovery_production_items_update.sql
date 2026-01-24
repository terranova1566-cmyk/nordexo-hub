create policy "discovery_production_items_update"
  on public.discovery_production_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.discovery_production_items to authenticated;
