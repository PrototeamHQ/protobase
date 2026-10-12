-- A listing that is published, created so or a draft given its `published_at`, has the match-listing job
-- (jobs/match-listing.ts) find the search profiles it fits. In the same transaction: no publish without its job.
create function market.listing_published() returns trigger
language plpgsql as $$
begin
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    perform jobs.enqueue('match-listing', jsonb_build_object('listingId', new.id), key => 'listing:' || new.id);
  end if;
  return new;
end
$$;

create trigger listing_published after insert or update of published_at on market.listings
  for each row execute function market.listing_published();
