-- The listings' map asks for those inside its view: a bounding box on the position, which this index answers.
create index listings_position_idx on market.listings (latitude, longitude);
