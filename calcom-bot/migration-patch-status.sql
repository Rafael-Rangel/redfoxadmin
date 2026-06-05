-- Rode no SQL Editor se a tabela já existir (adiciona novos status)
alter table public.calcom_accounts drop constraint if exists calcom_accounts_status_check;
alter table public.calcom_accounts add constraint calcom_accounts_status_check
  check (status in (
    'pending', 'email_created', 'signup_started', 'email_verified',
    'onboarding_done', 'configuring', 'configured', 'completed', 'failed'
  ));

alter table public.calcom_accounts alter column timezone set default 'America/Maceio';
