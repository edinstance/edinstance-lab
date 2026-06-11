create table if not exists services (
  id uuid primary key,
  name text not null unique,
  image text not null,
  port integer not null check (port >= 1 and port <= 65535),
  replicas integer not null default 2 check (replicas >= 1 and replicas <= 20),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_domains (
  id uuid primary key,
  service_id uuid not null references services(id) on delete cascade,
  hostname text not null,
  scope text not null default 'public',
  created_at timestamptz not null default now(),
  unique (service_id, hostname)
);

create table if not exists service_env_vars (
  id uuid primary key,
  service_id uuid not null references services(id) on delete cascade,
  name text not null,
  value_encrypted text not null,
  is_secret boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, name),
  check (name ~ '^[A-Za-z_][A-Za-z0-9_]*$')
);

create table if not exists deployments (
  id uuid primary key,
  service_id uuid not null references services(id) on delete cascade,
  image text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists postgres_databases (
  id uuid primary key,
  name text not null unique,
  namespace text not null unique,
  storage_size text not null default '20Gi',
  version text not null default '17',
  status text not null default 'pending',
  git_commit_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_domains_service_id on service_domains(service_id);
create index if not exists idx_service_env_vars_service_id on service_env_vars(service_id);
create index if not exists idx_deployments_service_id_created_at on deployments(service_id, created_at desc);
