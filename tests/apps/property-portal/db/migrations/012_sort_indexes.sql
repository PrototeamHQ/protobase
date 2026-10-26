-- Each sortable column is served alone too, as a list sorted by it is: by address, a photo's position or a search's name.
create index listings_address_idx on market.listings (address);
create index listing_photos_position_idx on market.listing_photos (position);
create index saved_searches_name_idx on members.saved_searches (name);
