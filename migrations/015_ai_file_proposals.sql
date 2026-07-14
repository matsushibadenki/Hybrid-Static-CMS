create table if not exists ai_file_proposals (
  id bigserial primary key,
  relative_path text not null,
  proposed_content text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by bigint references users(id) on delete set null,
  reviewed_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists ai_file_proposals_status_idx on ai_file_proposals (status, created_at desc);
