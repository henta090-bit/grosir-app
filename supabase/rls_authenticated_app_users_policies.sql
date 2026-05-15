alter table public.app_users enable row level security;

drop policy if exists "app_users authenticated select" on public.app_users;
drop policy if exists "app_users authenticated insert" on public.app_users;
drop policy if exists "app_users authenticated update" on public.app_users;
drop policy if exists "app_users authenticated delete" on public.app_users;

create policy "app_users authenticated select"
on public.app_users
for select
to authenticated
using (true);

create policy "app_users authenticated insert"
on public.app_users
for insert
to authenticated
with check (true);

create policy "app_users authenticated update"
on public.app_users
for update
to authenticated
using (true)
with check (true);

create policy "app_users authenticated delete"
on public.app_users
for delete
to authenticated
using (true);
