alter table postgres_databases
  add column if not exists public boolean not null default false,
  add column if not exists public_hostname text not null default '',
  add column if not exists public_source_cidrs text[] not null default '{}';
