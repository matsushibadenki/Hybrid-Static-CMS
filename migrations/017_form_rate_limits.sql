create table if not exists form_submission_attempts (
  attempt_key text primary key,
  attempts integer not null default 0,
  window_started timestamptz not null default now()
);
