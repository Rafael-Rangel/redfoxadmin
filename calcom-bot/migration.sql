-- Tabela dedicada ao robô de criação de contas Cal.com
-- Execute no SQL Editor do Supabase (Dashboard > SQL Editor)

create table if not exists public.calcom_accounts (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  clinic_name text,
  temp_email text not null,
  temp_email_password text,
  cal_username text,
  cal_password text,
  event_type_id text,
  cal_user_id text,
  timezone text default 'America/Maceio',
  status text not null default 'pending'
    check (status in ('pending', 'email_created', 'signup_started', 'email_verified', 'onboarding_done', 'configuring', 'configured', 'completed', 'failed')),
  error_message text,
  profile_reference text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calcom_accounts_status_idx on public.calcom_accounts (status);
create index if not exists calcom_accounts_temp_email_idx on public.calcom_accounts (temp_email);

alter table public.calcom_accounts enable row level security;

grant select, insert, update, delete on public.calcom_accounts to service_role;

create policy "service_role full access on calcom_accounts"
  on public.calcom_accounts
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.calcom_accounts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calcom_accounts_updated_at on public.calcom_accounts;
create trigger calcom_accounts_updated_at
  before update on public.calcom_accounts
  for each row
  execute function public.calcom_accounts_set_updated_at();
