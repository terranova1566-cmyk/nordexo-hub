create extension if not exists pg_trgm with schema public;

DO $$
BEGIN
  IF to_regclass('public.orders_global') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS orders_global_transaction_date_id_idx
      ON public.orders_global (transaction_date asc, id asc);

    CREATE INDEX IF NOT EXISTS orders_global_date_shipped_id_idx
      ON public.orders_global (date_shipped asc nulls last, id asc);

    CREATE INDEX IF NOT EXISTS orders_global_sales_channel_id_idx
      ON public.orders_global (sales_channel_id);

    CREATE INDEX IF NOT EXISTS orders_global_order_number_trgm_idx
      ON public.orders_global USING gin (order_number gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS orders_global_customer_name_trgm_idx
      ON public.orders_global USING gin (customer_name gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS orders_global_customer_email_trgm_idx
      ON public.orders_global USING gin (customer_email gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS orders_global_customer_address_trgm_idx
      ON public.orders_global USING gin (customer_address gin_trgm_ops);
  END IF;

  IF to_regclass('public.order_items_global') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS order_items_global_order_id_idx
      ON public.order_items_global (order_id);

    CREATE INDEX IF NOT EXISTS order_items_global_sku_idx
      ON public.order_items_global (sku);

    CREATE INDEX IF NOT EXISTS order_items_global_sku_trgm_idx
      ON public.order_items_global USING gin (sku gin_trgm_ops);
  END IF;

  IF to_regclass('public.catalog_products') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS catalog_products_spu_idx
      ON public.catalog_products (spu);

    CREATE INDEX IF NOT EXISTS catalog_products_spu_trgm_idx
      ON public.catalog_products USING gin (spu gin_trgm_ops);
  END IF;
END $$;
