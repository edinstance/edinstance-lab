alter table postgres_databases
  add column if not exists instances integer not null default 3,
  add column if not exists database_name text not null default 'app',
  add column if not exists owner_name text not null default 'app',
  add column if not exists pooler_enabled boolean not null default true,
  add column if not exists pooler_instances integer not null default 2,
  add column if not exists pool_mode text not null default 'session';

update services
set next_reconcile_at = now()
where reconcile_state = 'pending' and reconcile_attempts = 0;
