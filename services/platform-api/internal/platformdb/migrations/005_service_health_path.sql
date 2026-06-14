alter table services
  add column if not exists health_path text not null default '/health';

alter table services
  add constraint services_health_path_check
  check (health_path ~ '^/[^[:space:]]*$');
