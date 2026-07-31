create table if not exists editor_autosaves (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  content_type text not null check (content_type in ('post', 'page')),
  draft_key text not null,
  payload jsonb not null default '{}'::jsonb,
  base_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_type, draft_key),
  check (draft_key ~ '^[A-Za-z0-9_-]{1,96}$')
);

create index if not exists editor_autosaves_updated_idx
  on editor_autosaves (updated_at);
