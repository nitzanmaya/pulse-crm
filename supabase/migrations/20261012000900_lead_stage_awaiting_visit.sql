-- New pipeline stage between "proposal" and "won": the customer booked a
-- visit and is waiting for the technician
alter type public.lead_stage add value if not exists 'awaiting_visit' before 'won';
