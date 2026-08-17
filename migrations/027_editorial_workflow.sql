alter table posts
  add column if not exists workflow_state text not null default 'draft',
  add column if not exists workflow_content_hash text,
  add column if not exists workflow_note text,
  add column if not exists review_requested_at timestamptz,
  add column if not exists review_requested_by bigint references users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by bigint references users(id) on delete set null;

alter table pages
  add column if not exists workflow_state text not null default 'draft',
  add column if not exists workflow_content_hash text,
  add column if not exists workflow_note text,
  add column if not exists review_requested_at timestamptz,
  add column if not exists review_requested_by bigint references users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by bigint references users(id) on delete set null;

alter table posts drop constraint if exists posts_workflow_state_check;
alter table posts add constraint posts_workflow_state_check
  check (workflow_state in ('draft', 'in_review', 'changes_requested', 'approved'));
alter table pages drop constraint if exists pages_workflow_state_check;
alter table pages add constraint pages_workflow_state_check
  check (workflow_state in ('draft', 'in_review', 'changes_requested', 'approved'));

update posts set workflow_state = 'approved' where status in ('published', 'scheduled') and workflow_state = 'draft';
update pages set workflow_state = 'approved' where status in ('published', 'scheduled') and workflow_state = 'draft';

create index if not exists posts_workflow_state_idx on posts (workflow_state, updated_at desc);
create index if not exists pages_workflow_state_idx on pages (workflow_state, updated_at desc);

create table if not exists editorial_workflow_events (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in ('post', 'page')),
  content_id bigint not null,
  action text not null check (action in ('submit', 'approve', 'request_changes', 'withdraw')),
  from_state text not null,
  to_state text not null,
  note text,
  actor_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists editorial_workflow_events_content_idx
  on editorial_workflow_events (content_type, content_id, created_at desc, id desc);
