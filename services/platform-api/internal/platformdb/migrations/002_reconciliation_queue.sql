alter table services
  add column if not exists desired_generation bigint not null default 1,
  add column if not exists reconciled_generation bigint not null default 0,
  add column if not exists reconcile_state text not null default 'pending',
  add column if not exists reconcile_attempts integer not null default 0,
  add column if not exists next_reconcile_at timestamptz not null default now(),
  add column if not exists last_reconcile_error text,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists reconcile_lease_until timestamptz;

alter table services
  drop constraint if exists services_reconcile_state_check;

alter table services
  add constraint services_reconcile_state_check
  check (reconcile_state in ('pending', 'reconciling', 'ready', 'failed', 'deleting'));

create index if not exists idx_services_reconciliation_queue
  on services (next_reconcile_at)
  where reconcile_state in ('pending', 'reconciling', 'ready', 'failed', 'deleting');
