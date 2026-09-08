alter table background_jobs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table background_jobs drop constraint if exists background_jobs_job_type_check;
alter table background_jobs add constraint background_jobs_job_type_check check (job_type in ('render_public_artifacts', 'regenerate_media_variants'));
create unique index if not exists background_jobs_one_active_media_variant_idx on background_jobs ((payload->>'mediaId')) where job_type = 'regenerate_media_variants' and status in ('queued', 'running');
