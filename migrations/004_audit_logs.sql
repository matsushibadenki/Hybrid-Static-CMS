create table if not exists audit_logs (
  id bigserial primary key,
  actor_user_id bigint references users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  summary text not null,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);
create index if not exists audit_logs_target_idx on audit_logs (target_type, target_id);
