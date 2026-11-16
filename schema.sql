-- Execute no SQL Editor do Supabase.
create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  external_reference text not null unique,
  mp_order_id text unique,
  product_id text not null check (product_id in ('small','medium','large')),
  product_name text not null,
  product_amount numeric(10,2) not null,
  shipping_amount numeric(10,2) not null,
  total_amount numeric(10,2) not null,
  origin_cep text not null,
  destination_cep text not null,
  status text not null default 'creating_payment',
  mp_status text,
  form_token_hash text not null,
  form_token_ciphertext text,
  paid_at timestamptz,
  tally_submission_id text,
  fulfillment_submitted_at timestamptz,
  shipping_details jsonb,
  tracking_code text,
  carrier text,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- Bloqueia acesso direto do navegador. Somente o backend com service_role opera a tabela.
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
