-- A filter, sort or search reads only columns an index serves. The home page's rows of listings on offer read the
-- first two, newest first, however many listings are on offer.
create index listings_for_sale_idx on market.listings (for_sale, status, published_at desc);
create index listings_for_rent_idx on market.listings (for_rent, status, published_at desc);
create index listings_status_idx on market.listings (status, published_at desc);
create index listings_purchase_price_idx on market.listings (purchase_price);
create index listings_rent_price_idx on market.listings (rent_price);
create index listings_price_per_m2_idx on market.listings (price_per_m2);
create index listings_bedrooms_idx on market.listings (bedrooms);
create index listings_plot_area_idx on market.listings (plot_area);
create index listings_built_year_idx on market.listings (built_year);
create index listings_longitude_idx on market.listings (longitude);
create index listings_garden_idx on market.listings (garden);
create index listings_balcony_idx on market.listings (balcony);
create index listings_parking_idx on market.listings (parking);
create index listings_created_at_idx on market.listings (created_at);
create index listings_postal_code_trgm_idx on market.listings using gin (postal_code gin_trgm_ops);

create index places_region_only_idx on market.places (region);
create index places_name_idx on market.places (name);
create index places_region_trgm_idx on market.places using gin (region gin_trgm_ops);
create index agencies_name_idx on market.agencies (name);
create index agencies_created_at_idx on market.agencies (created_at);

create index alerts_saved_search_idx on members.alerts (saved_search_id, matched_at desc);
create index alerts_matched_at_idx on members.alerts (matched_at);
create index alerts_emailed_at_idx on members.alerts (emailed_at);
create index favorites_created_at_idx on members.favorites (created_at);
create index notes_listing_updated_idx on members.notes (listing_id, updated_at desc);
create index notes_created_at_idx on members.notes (created_at);
create index notes_updated_at_idx on members.notes (updated_at);
create index notes_body_trgm_idx on members.notes using gin (body gin_trgm_ops);
create index saved_searches_created_at_idx on members.saved_searches (created_at);
create index saved_searches_seen_at_idx on members.saved_searches (seen_at);
create index saved_searches_alert_frequency_idx on members.saved_searches (alert_frequency);
create index saved_searches_name_trgm_idx on members.saved_searches using gin (name gin_trgm_ops);
