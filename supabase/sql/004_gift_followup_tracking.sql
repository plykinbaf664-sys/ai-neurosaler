alter table public.leads
  add column if not exists gift_link_clicked_at timestamptz,
  add column if not exists gift_followup_due_at timestamptz,
  add column if not exists gift_followup_sent_at timestamptz;
