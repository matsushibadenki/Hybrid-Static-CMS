create table if not exists background_jobs (
  id bigint generated always as identity primary key,
  job_type text not null check (job_type in ('render_public_artifacts')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists background_jobs_one_active_render_idx
  on background_jobs (job_type) where status in ('queued', 'running');
create index if not exists background_jobs_due_idx
  on background_jobs (run_after, id) where status = 'queued';
