create table mail_outbox (
  id bigint generated always as identity primary key,
  submission_id bigint not null unique references form_submissions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'sent', 'failed', 'uncertain')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index mail_outbox_due_idx on mail_outbox(run_after, id) where status = 'queued';
