alter table posts
  add column if not exists scheduled_publish_attempts integer not null default 0,
  add column if not exists scheduled_publish_next_retry_at timestamptz,
  add column if not exists scheduled_publish_last_error text;

alter table pages
  add column if not exists scheduled_publish_attempts integer not null default 0,
  add column if not exists scheduled_publish_next_retry_at timestamptz,
  add column if not exists scheduled_publish_last_error text;

create index if not exists posts_scheduled_retry_idx
  on posts (published_at, scheduled_publish_next_retry_at)
  where status = 'scheduled';

create index if not exists pages_scheduled_retry_idx
  on pages (published_at, scheduled_publish_next_retry_at)
  where status = 'scheduled';
