create table if not exists operational_metrics (
  bucket_start timestamptz not null,
  metric text not null,
  value bigint not null default 0 check (value >= 0),
  primary key (bucket_start, metric),
  check (metric in (
    'http.public_request',
    'http.public_4xx',
    'http.public_5xx',
    'publishing.completed',
    'form.submitted',
    'media.changed',
    'backup.created'
  ))
);

create index if not exists operational_metrics_metric_bucket_idx
  on operational_metrics (metric, bucket_start desc);
