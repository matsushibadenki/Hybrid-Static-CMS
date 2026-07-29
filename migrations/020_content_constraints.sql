update posts set status = 'draft' where status not in ('draft', 'published', 'scheduled');
update pages set status = 'draft' where status not in ('draft', 'published', 'scheduled');
update forms set status = 'draft' where status not in ('draft', 'published');
update form_fields set field_type = 'text' where field_type not in ('text', 'email', 'textarea', 'select', 'checkbox');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_status_check' and conrelid = 'posts'::regclass) then
    alter table posts add constraint posts_status_check check (status in ('draft', 'published', 'scheduled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pages_status_check' and conrelid = 'pages'::regclass) then
    alter table pages add constraint pages_status_check check (status in ('draft', 'published', 'scheduled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forms_status_check' and conrelid = 'forms'::regclass) then
    alter table forms add constraint forms_status_check check (status in ('draft', 'published'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'form_fields_type_check' and conrelid = 'form_fields'::regclass) then
    alter table form_fields add constraint form_fields_type_check check (field_type in ('text', 'email', 'textarea', 'select', 'checkbox'));
  end if;
end
$$;
