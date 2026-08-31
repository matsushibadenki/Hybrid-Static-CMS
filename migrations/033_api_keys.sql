create table if not exists api_keys (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  name text not null,
  key_prefix text not null unique,
  secret_hash text not null unique,
  permissions text[] not null default '{}',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(name) between 1 and 100),
  check (cardinality(permissions) between 1 and 32)
);

create index if not exists api_keys_active_lookup_idx
  on api_keys (key_prefix)
  where revoked_at is null;

create index if not exists api_keys_user_created_idx
  on api_keys (user_id, created_at desc);
