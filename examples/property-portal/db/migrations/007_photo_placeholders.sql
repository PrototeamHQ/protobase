-- Each photo's ThumbHash, which the app draws while the photo loads: the upload computes it (`.placeholder()`), and
-- photos stored before stay without one.
alter table market.listings add column photo_placeholder text;
alter table market.listing_photos add column photo_placeholder text;
