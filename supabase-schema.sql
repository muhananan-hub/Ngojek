-- Jalankan di Supabase SQL Editor. Storage bucket dibuat private.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
create policy "admin can read own role" on public.admin_users
 for select to authenticated using (user_id = auth.uid());

create table if not exists public.driver_applications (
 id uuid primary key default gen_random_uuid(),
 registration_no text not null unique,
 full_name text not null,
 whatsapp text not null,
 address text not null,
 ktp_number text not null,
 sim_number text not null,
 photo_path text not null,
 ktp_path text not null,
 sim_path text not null,
 status text not null default 'pending' check (status in ('pending','review','accepted','rejected')),
 consent_at timestamptz not null,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
alter table public.driver_applications enable row level security;
revoke all on public.driver_applications from anon, authenticated;
grant insert on public.driver_applications to anon, authenticated;
grant select, update on public.driver_applications to authenticated;
create policy "public can submit applications" on public.driver_applications
 for insert to anon, authenticated with check (
  status = 'pending' and reviewed_at is null and reviewed_by is null
 );
create policy "admins can view applications" on public.driver_applications
 for select to authenticated using (
  exists(select 1 from public.admin_users a where a.user_id = auth.uid())
);
create policy "admins can update applications" on public.driver_applications
 for update to authenticated using (
  exists(select 1 from public.admin_users a where a.user_id = auth.uid())
 ) with check (
  exists(select 1 from public.admin_users a where a.user_id = auth.uid())
 );

-- Buat bucket privat untuk berkas identitas. Tidak ada akses publik.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-documents','driver-documents',false,5242880,
 array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=5242880,
 allowed_mime_types=excluded.allowed_mime_types;

create policy "public can upload driver documents" on storage.objects
 for insert to anon, authenticated with check (bucket_id = 'driver-documents');
create policy "admins can read driver documents" on storage.objects
 for select to authenticated using (
  bucket_id = 'driver-documents' and exists (
   select 1 from public.admin_users a where a.user_id = auth.uid()
  )
);
-- Uploads are intentionally not publicly readable. Keep the bucket private.


-- ===== Tambahan akun driver dan pesanan =====
-- Jalankan setelah bagian schema awal. Driver mendaftar menggunakan Supabase Auth.
alter table public.driver_applications add column if not exists user_id uuid unique references auth.users(id) on delete cascade;
alter table public.driver_applications add column if not exists email text;
-- Pastikan driver hanya dapat melihat data pendaftarannya sendiri.
grant select on public.driver_applications to authenticated;
drop policy if exists "driver can view own application" on public.driver_applications;
create policy "driver can view own application" on public.driver_applications
 for select to authenticated using (user_id = auth.uid());

create table if not exists public.driver_orders (
 id uuid primary key default gen_random_uuid(),
 order_no text not null unique,
 pickup_address text not null,
 destination_address text not null,
 fare numeric(12,2) not null check (fare > 0),
 status text not null default 'available' check (status in ('available','assigned','completed','cancelled')),
 driver_user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 assigned_at timestamptz,
 completed_at timestamptz,
 commission_amount numeric(12,2) generated always as (round(fare * 0.08, 2)) stored
);
alter table public.driver_orders enable row level security;
revoke all on public.driver_orders from anon;
grant select on public.driver_orders to authenticated;
drop policy if exists "accepted drivers can see available and own orders" on public.driver_orders;
create policy "accepted drivers can see available and own orders" on public.driver_orders
 for select to authenticated using (
   driver_user_id = auth.uid() or
   (status = 'available' and exists (
     select 1 from public.driver_applications d where d.user_id = auth.uid() and d.status = 'accepted'
   )) or exists(select 1 from public.admin_users a where a.user_id = auth.uid())
 );
-- Admin/backend yang tepercaya membuat pesanan dan menandai penyelesaian. Jangan izinkan driver mengubah fare/status langsung.
revoke insert, update, delete on public.driver_orders from anon, authenticated;
grant insert, update, delete on public.driver_orders to authenticated;
drop policy if exists "admins manage driver orders" on public.driver_orders;
create policy "admins manage driver orders" on public.driver_orders
 for all to authenticated using (
  exists(select 1 from public.admin_users a where a.user_id = auth.uid())
 ) with check (
  exists(select 1 from public.admin_users a where a.user_id = auth.uid())
 );

create or replace function public.claim_driver_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_status text;
begin
 if auth.uid() is null then raise exception 'Silakan login terlebih dahulu.'; end if;
 if not exists(select 1 from public.driver_applications d where d.user_id=auth.uid() and d.status='accepted') then
  raise exception 'Akun driver belum disetujui admin.';
 end if;
 update public.driver_orders set status='assigned',driver_user_id=auth.uid(),assigned_at=now()
 where id=p_order_id and status='available' and driver_user_id is null;
 if not found then raise exception 'Pesanan sudah diambil driver lain atau tidak tersedia.'; end if;
end; $$;
revoke all on function public.claim_driver_order(uuid) from public, anon;
grant execute on function public.claim_driver_order(uuid) to authenticated;

-- Dokumen disimpan privat; policy upload berlaku untuk pengguna yang sudah login.
drop policy if exists "public can upload driver documents" on storage.objects;
create policy "drivers upload own documents" on storage.objects
 for insert to authenticated with check (
  bucket_id='driver-documents' and (storage.foldername(name))[1]=auth.uid()::text
 );


-- Perketat kebijakan pendaftaran: akun harus login dan hanya boleh mengirim profil untuk dirinya sendiri.
revoke insert on public.driver_applications from anon;
revoke insert on public.driver_applications from authenticated;
grant insert on public.driver_applications to authenticated;
drop policy if exists "public can submit applications" on public.driver_applications;
drop policy if exists "drivers submit own application" on public.driver_applications;
create policy "drivers submit own application" on public.driver_applications
 for insert to authenticated with check (
  user_id = auth.uid() and status = 'pending' and reviewed_at is null and reviewed_by is null
 );
