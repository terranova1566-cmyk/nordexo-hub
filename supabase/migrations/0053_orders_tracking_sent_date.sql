alter table if exists public.order_tracking_numbers_global
  add column if not exists sent_date date;

with source_rows as (
  select
    oi.order_id,
    trim(coalesce(oi.raw_row ->> 'Tracking number', '')) as tracking_number,
    nullif(
      trim(
        coalesce(
          oi.raw_row ->> 'Date shipped',
          oi.date_shipped
        )
      ),
      ''
    ) as shipped_raw
  from public.order_items_global oi
),
normalized as (
  select
    order_id,
    tracking_number,
    case
      when shipped_raw is null then null::date
      when shipped_raw ~ '^\d{4}-\d{2}-\d{2}$' then shipped_raw::date
      when shipped_raw ~ '^\d{4}/\d{2}/\d{2}$' then to_date(shipped_raw, 'YYYY/MM/DD')
      when shipped_raw ~ '^\d{4}-\d{2}-\d{2}[T ].*$' then left(shipped_raw, 10)::date
      when shipped_raw ~ '^-?\d+([.,]\d+)?$'
        then date '1899-12-30' + floor(replace(shipped_raw, ',', '.')::numeric)::int
      else null::date
    end as sent_date
  from source_rows
  where tracking_number <> ''
),
aggregated as (
  select
    order_id,
    tracking_number,
    max(sent_date) as sent_date
  from normalized
  where sent_date is not null
  group by order_id, tracking_number
)
update public.order_tracking_numbers_global t
set sent_date = coalesce(t.sent_date, a.sent_date)
from aggregated a
where t.order_id = a.order_id
  and t.tracking_number = a.tracking_number
  and t.sent_date is null;

update public.order_tracking_numbers_global
set sent_date = created_at::date
where sent_date is null
  and created_at is not null;
