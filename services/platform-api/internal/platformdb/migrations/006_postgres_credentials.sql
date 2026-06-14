alter table postgres_databases
  add column if not exists password_encrypted text;
