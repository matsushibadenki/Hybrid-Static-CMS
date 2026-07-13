alter table sessions add column if not exists csrf_token text not null default '';
