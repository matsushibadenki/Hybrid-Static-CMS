create table if not exists operator_notifications (
  id bigserial primary key,
  level text not null default 'info' check (level in ('info', 'success', 'warning', 'error')),
  action text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists operator_notifications_unread_idx
  on operator_notifications (is_read, created_at desc);
