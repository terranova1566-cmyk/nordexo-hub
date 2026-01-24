create extension if not exists "pgcrypto";

create table if not exists public.b2b_pricing_markets (
  market text primary key,
  currency text not null,
  fx_rate_cny numeric not null default 0,
  weight_threshold_g integer not null default 300,
  packing_fee numeric not null default 0,
  markup_percent numeric not null default 0,
  markup_fixed numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.b2b_pricing_shipping_classes (
  id uuid primary key default gen_random_uuid(),
  market text not null references public.b2b_pricing_markets(market) on delete cascade,
  shipping_class text not null,
  rate_low numeric not null default 0,
  rate_high numeric not null default 0,
  base_low numeric not null default 0,
  base_high numeric not null default 0,
  mult_low numeric not null default 1,
  mult_high numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, shipping_class)
);

insert into public.b2b_pricing_markets (
  market,
  currency,
  fx_rate_cny,
  weight_threshold_g,
  packing_fee,
  markup_percent,
  markup_fixed
)
values
  ('SE', 'SEK', 1.4, 300, 3, 0.28, 12),
  ('NO', 'NOK', 1.4, 300, 3, 0.28, 12),
  ('DK', 'DKK', 1.4, 300, 3, 0.28, 12),
  ('FI', 'EUR', 1.4, 300, 3, 0.28, 12)
on conflict (market) do nothing;

insert into public.b2b_pricing_shipping_classes (
  market,
  shipping_class,
  rate_low,
  rate_high,
  base_low,
  base_high,
  mult_low,
  mult_high
)
values
  ('SE', 'NOR', 0.078, 0.069, 16, 21, 1.1, 1.1),
  ('SE', 'BAT', 0.09, 0.088, 16, 21, 1.05, 1.1),
  ('SE', 'LIQ', 0.09, 0.092, 16, 21, 1.05, 1.1),
  ('SE', 'PBA', 0.105, 0.105, 22, 22, 1.05, 1.1),
  ('NO', 'NOR', 0.078, 0.069, 16, 21, 1.1, 1.1),
  ('NO', 'BAT', 0.09, 0.088, 16, 21, 1.05, 1.1),
  ('NO', 'LIQ', 0.09, 0.092, 16, 21, 1.05, 1.1),
  ('NO', 'PBA', 0.105, 0.105, 22, 22, 1.05, 1.1),
  ('DK', 'NOR', 0.078, 0.069, 16, 21, 1.1, 1.1),
  ('DK', 'BAT', 0.09, 0.088, 16, 21, 1.05, 1.1),
  ('DK', 'LIQ', 0.09, 0.092, 16, 21, 1.05, 1.1),
  ('DK', 'PBA', 0.105, 0.105, 22, 22, 1.05, 1.1),
  ('FI', 'NOR', 0.078, 0.069, 16, 21, 1.1, 1.1),
  ('FI', 'BAT', 0.09, 0.088, 16, 21, 1.05, 1.1),
  ('FI', 'LIQ', 0.09, 0.092, 16, 21, 1.05, 1.1),
  ('FI', 'PBA', 0.105, 0.105, 22, 22, 1.05, 1.1)
on conflict (market, shipping_class) do nothing;
