alter table public.stock_movements
  add column if not exists movement_code text,
  add column if not exists direction text,
  add column if not exists source text,
  add column if not exists uom text,
  add column if not exists qty_input numeric not null default 0,
  add column if not exists qty_base_slop integer not null default 0,
  add column if not exists quantity_slop integer not null default 0,
  add column if not exists stock_before_slop integer not null default 0,
  add column if not exists stock_after_slop integer not null default 0,
  add column if not exists user_id uuid,
  add column if not exists actor text,
  add column if not exists note text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.stock_movements
  alter column movement_code set default ('MOV-' || replace(gen_random_uuid()::text, '-', '')),
  alter column source set default 'MUTASI_GUDANG',
  alter column uom set default 'Slop',
  alter column qty_input set default 0,
  alter column qty_base_slop set default 0,
  alter column quantity_slop set default 0,
  alter column stock_before_slop set default 0,
  alter column stock_after_slop set default 0;

alter table public.stock_movements
  drop constraint if exists stock_movements_movement_type_check,
  add constraint stock_movements_movement_type_check
    check (movement_type in ('IN', 'OUT', 'CHECK', 'MASUK', 'KELUAR', 'KOREKSI'));

alter table public.stock_movements
  drop constraint if exists stock_movements_source_check,
  add constraint stock_movements_source_check
    check (source in ('SCAN', 'OPNAME', 'ADJUST', 'INITIAL', 'IMPORT', 'SALES', 'PURCHASE', 'MUTASI_GUDANG', 'STOK_OPNAME'));

alter table public.stock_movements
  drop constraint if exists stock_movements_uom_check,
  add constraint stock_movements_uom_check
    check (uom in ('Slop', 'Bal', 'Karton'));

alter table public.stock_counts
  add column if not exists count_code text,
  add column if not exists uom text,
  add column if not exists qty_fisik numeric not null default 0,
  add column if not exists qty_fisik_slop integer not null default 0,
  add column if not exists stock_before_slop integer not null default 0,
  add column if not exists physical_stock_slop integer not null default 0,
  add column if not exists physical_qty jsonb not null default '{"slop": 0, "bal": 0, "karton": 0}'::jsonb,
  add column if not exists variance_slop integer not null default 0,
  add column if not exists user_id uuid,
  add column if not exists actor text,
  add column if not exists note text,
  add column if not exists status text not null default 'CHECKED',
  add column if not exists count_date date not null default ((now() at time zone 'Asia/Jakarta')::date);

alter table public.stock_counts
  alter column count_code set default ('OPN-' || replace(gen_random_uuid()::text, '-', '')),
  alter column uom set default 'Slop',
  alter column qty_fisik set default 0,
  alter column qty_fisik_slop set default 0,
  alter column stock_before_slop set default 0,
  alter column variance_slop set default 0,
  alter column status set default 'CHECKED';

alter table public.stock_counts
  drop constraint if exists stock_counts_status_check,
  add constraint stock_counts_status_check
    check (status in ('SESUAI', 'KOREKSI', 'CHECKED'));

create unique index if not exists stock_counts_unique_product_date_idx
  on public.stock_counts (product_id, count_date);

create index if not exists stock_movements_created_at_idx
  on public.stock_movements (created_at desc);

create index if not exists stock_movements_product_id_idx
  on public.stock_movements (product_id);

create index if not exists stock_counts_count_date_idx
  on public.stock_counts (count_date desc);

create or replace function public.prepare_stock_count_variance()
returns trigger
language plpgsql
as $$
begin
  new.variance_slop = coalesce(new.physical_stock_slop, 0) - coalesce(new.stock_before_slop, 0);
  return new;
end;
$$;

drop trigger if exists stock_counts_prepare_variance on public.stock_counts;

create trigger stock_counts_prepare_variance
before insert or update on public.stock_counts
for each row
execute function public.prepare_stock_count_variance();

alter table public.stock_movements disable row level security;
alter table public.stock_counts disable row level security;
