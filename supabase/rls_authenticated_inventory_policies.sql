alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_counts enable row level security;

drop policy if exists "products authenticated select" on public.products;
drop policy if exists "products authenticated insert" on public.products;
drop policy if exists "products authenticated update" on public.products;
drop policy if exists "products authenticated delete" on public.products;

create policy "products authenticated select"
on public.products
for select
to authenticated
using (true);

create policy "products authenticated insert"
on public.products
for insert
to authenticated
with check (true);

create policy "products authenticated update"
on public.products
for update
to authenticated
using (true)
with check (true);

create policy "products authenticated delete"
on public.products
for delete
to authenticated
using (true);

drop policy if exists "stock_movements authenticated select" on public.stock_movements;
drop policy if exists "stock_movements authenticated insert" on public.stock_movements;
drop policy if exists "stock_movements authenticated update" on public.stock_movements;
drop policy if exists "stock_movements authenticated delete" on public.stock_movements;

create policy "stock_movements authenticated select"
on public.stock_movements
for select
to authenticated
using (true);

create policy "stock_movements authenticated insert"
on public.stock_movements
for insert
to authenticated
with check (true);

create policy "stock_movements authenticated update"
on public.stock_movements
for update
to authenticated
using (true)
with check (true);

create policy "stock_movements authenticated delete"
on public.stock_movements
for delete
to authenticated
using (true);

drop policy if exists "stock_counts authenticated select" on public.stock_counts;
drop policy if exists "stock_counts authenticated insert" on public.stock_counts;
drop policy if exists "stock_counts authenticated update" on public.stock_counts;
drop policy if exists "stock_counts authenticated delete" on public.stock_counts;

create policy "stock_counts authenticated select"
on public.stock_counts
for select
to authenticated
using (true);

create policy "stock_counts authenticated insert"
on public.stock_counts
for insert
to authenticated
with check (true);

create policy "stock_counts authenticated update"
on public.stock_counts
for update
to authenticated
using (true)
with check (true);

create policy "stock_counts authenticated delete"
on public.stock_counts
for delete
to authenticated
using (true);
