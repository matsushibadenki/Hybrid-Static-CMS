create table if not exists content_revisions (
  id bigserial primary key,
  content_type text not null check (content_type in ('post', 'page')),
  content_id bigint not null,
  snapshot_json jsonb not null,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_revisions_lookup_idx
  on content_revisions (content_type, content_id, created_at desc, id desc);
