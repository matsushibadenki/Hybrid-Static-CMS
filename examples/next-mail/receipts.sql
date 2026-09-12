create table if not exists mail_delivery_receipts (
  delivery_id uuid primary key,
  payload_hash text not null,
  status text not null default 'processing' check (status in ('processing', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
