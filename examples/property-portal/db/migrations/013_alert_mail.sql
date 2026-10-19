-- An alert is mailed only when its search sent email as the listing fit it: `mail_due` records that, written by the
-- match-listing job (jobs/match-listing.ts). A listing found while its search sent no email is never mailed later, when
-- the member turns its email on. The alerts recorded before this migration that never went out are not due: no mail
-- goes out for a match from before the member chose to hear of it.
alter table members.alerts add column mail_due boolean;
update members.alerts set mail_due = emailed_at is not null;
alter table members.alerts alter column mail_due set not null;

drop index members.alerts_unmailed_idx;
create index alerts_unmailed_idx on members.alerts (user_id) where emailed_at is null and mail_due;

-- A search switched to mail at once mails the listings it found that still wait for the daily digest, now.
create function members.saved_search_instant() returns trigger
language plpgsql as $$
begin
  if new.alert_frequency = 'instant' and old.alert_frequency <> 'instant' and exists (
    select 1 from members.alerts a where a.saved_search_id = new.id and a.emailed_at is null and a.mail_due
  ) then
    perform jobs.enqueue('email-alerts', jsonb_build_object('userId', new.user_id, 'frequency', 'instant'), key => 'instant:' || new.user_id);
  end if;
  return new;
end
$$;

create trigger saved_search_instant after update of alert_frequency on members.saved_searches
  for each row execute function members.saved_search_instant();
