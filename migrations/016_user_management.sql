alter table users add column if not exists is_active boolean not null default true;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists password_changed_at timestamptz;

create index if not exists users_active_idx on users (is_active, created_at desc);
