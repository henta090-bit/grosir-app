alter table public.products
  add column if not exists category_code text,
  add column if not exists category_name text;

create or replace function public.product_category_name(input_code text)
returns text
language sql
immutable
as $$
  select case input_code
    when '01' then 'Rokok'
    when '02' then 'Obat'
    when '03' then 'Kopi'
    when '04' then 'Permen'
    when '05' then 'Shampoo'
    when '06' then 'Susu'
    when '07' then 'Mie'
    when '08' then 'Snack'
    when '09' then 'Sabun/Cuci'
    when '10' then 'Dental'
    when '11' then 'Teh'
    when '12' then 'Bumbu/Sembako'
    when '13' then 'Minuman Energi'
    when '14' then 'Tissue/Pampers'
    when '15' then 'Minuman'
    when '16' then 'Kosmetik'
    when '17' then 'Pembersih'
    when '18' then 'ATK/Lainnya'
    else 'Rokok'
  end;
$$;

create or replace function public.resolve_product_category_code(input_sku text, requested_code text default null)
returns text
language sql
immutable
as $$
  select case
    when left(coalesce(input_sku, ''), 2) in (
      '01', '02', '03', '04', '05', '06', '07', '08', '09',
      '10', '11', '12', '13', '14', '15', '16', '17', '18'
    ) then left(input_sku, 2)
    when coalesce(requested_code, '') in (
      '01', '02', '03', '04', '05', '06', '07', '08', '09',
      '10', '11', '12', '13', '14', '15', '16', '17', '18'
    ) then requested_code
    else '01'
  end;
$$;

create or replace function public.prepare_product_category()
returns trigger
language plpgsql
as $$
begin
  new.category_code = public.resolve_product_category_code(new.sku, new.category_code);
  new.category_name = public.product_category_name(new.category_code);
  return new;
end;
$$;

drop trigger if exists products_prepare_category on public.products;

create trigger products_prepare_category
before insert or update of sku, category_code on public.products
for each row
execute function public.prepare_product_category();

update public.products
set
  category_code = public.resolve_product_category_code(sku, category_code),
  category_name = public.product_category_name(public.resolve_product_category_code(sku, category_code))
where category_code is null
  or category_name is null
  or category_code <> public.resolve_product_category_code(sku, category_code)
  or category_name <> public.product_category_name(public.resolve_product_category_code(sku, category_code));

alter table public.products
  alter column category_code set default '01',
  alter column category_name set default 'Rokok';

alter table public.products
  drop constraint if exists products_category_code_check,
  add constraint products_category_code_check
    check (category_code in (
      '01', '02', '03', '04', '05', '06', '07', '08', '09',
      '10', '11', '12', '13', '14', '15', '16', '17', '18'
    ));

alter table public.products
  drop constraint if exists products_sku_key;

alter table public.products
  drop constraint if exists products_sku_format_check,
  add constraint products_sku_format_check
    check (sku ~ '^[0-9]{5}$');

drop index if exists products_sku_unique_idx;

create unique index products_sku_unique_idx
  on public.products (lower(sku))
  where is_active = true and sku is not null and sku <> '';

create index if not exists products_category_name_idx
  on public.products (category_code, name);

create index if not exists products_active_category_name_idx
  on public.products (is_active, category_code, name);

create or replace function public.create_product_with_next_sku(
  product_payload jsonb,
  requested_category_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_category_code text;
  next_number integer;
  next_sku text;
  prepared_payload jsonb;
  inserted_product public.products;
begin
  safe_category_code := public.resolve_product_category_code(null, requested_category_code);

  perform pg_advisory_xact_lock(hashtext('products-sku-' || safe_category_code));

  select candidate.number
  into next_number
  from generate_series(1, 999) as candidate(number)
  where not exists (
    select 1
    from public.products product
    where product.sku = safe_category_code || lpad(candidate.number::text, 3, '0')
      and product.is_active = true
  )
  order by candidate.number
  limit 1;

  if next_number is null then
    raise exception 'Nomor SKU kategori % sudah penuh.', safe_category_code;
  end if;

  next_sku := safe_category_code || lpad(next_number::text, 3, '0');
  prepared_payload := product_payload
    - 'id'
    - 'sku'
    - 'category_code'
    - 'category_name'
    || jsonb_build_object(
      'sku', next_sku,
      'category_code', safe_category_code,
      'category_name', public.product_category_name(safe_category_code)
    );

  insert into public.products (
    sku,
    category_code,
    category_name,
    name,
    barcode_slop,
    barcode_bal,
    barcode_karton,
    current_stock_slop,
    min_stock_slop,
    isi_slop_per_bal,
    isi_slop_per_karton,
    is_active
  )
  values (
    prepared_payload->>'sku',
    prepared_payload->>'category_code',
    prepared_payload->>'category_name',
    prepared_payload->>'name',
    nullif(prepared_payload->>'barcode_slop', ''),
    nullif(prepared_payload->>'barcode_bal', ''),
    nullif(prepared_payload->>'barcode_karton', ''),
    coalesce((prepared_payload->>'current_stock_slop')::integer, 0),
    coalesce((prepared_payload->>'min_stock_slop')::integer, 0),
    greatest(coalesce((prepared_payload->>'isi_slop_per_bal')::integer, 10), 1),
    coalesce((prepared_payload->>'isi_slop_per_karton')::integer, 0),
    coalesce((prepared_payload->>'is_active')::boolean, true)
  )
  returning * into inserted_product;

  return to_jsonb(inserted_product);
end;
$$;
