-- Rendering is site-wide; media jobs are deduplicated separately by media ID.
drop index if exists background_jobs_one_active_render_idx;
create unique index background_jobs_one_active_render_idx
  on background_jobs (job_type)
  where job_type = 'render_public_artifacts' and status in ('queued', 'running');
