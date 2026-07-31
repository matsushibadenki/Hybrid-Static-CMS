alter table users
  add column if not exists totp_secret_encrypted text,
  add column if not exists totp_enabled_at timestamptz,
  add column if not exists totp_pending_secret_encrypted text,
  add column if not exists totp_pending_expires_at timestamptz,
  add column if not exists recovery_code_hashes text[] not null default '{}';

alter table sessions
  add column if not exists created_ip text,
  add column if not exists user_agent text,
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists sessions_user_last_seen_idx
  on sessions (user_id, last_seen_at desc);
