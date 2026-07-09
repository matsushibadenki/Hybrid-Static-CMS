create table if not exists file_snapshots (
  id bigserial primary key,
  relative_path text not null,
  file_type text not null,
  content text not null,
  reason text,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists file_snapshots_relative_path_idx on file_snapshots (relative_path, created_at desc);
