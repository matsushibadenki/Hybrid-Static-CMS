alter table mail_outbox add column delivery_id uuid not null default gen_random_uuid();
create unique index mail_outbox_delivery_id_idx on mail_outbox(delivery_id);
