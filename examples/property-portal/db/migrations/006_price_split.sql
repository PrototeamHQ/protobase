-- A listing has a purchase price, a rent per month, or both: in the Netherlands a home for sale is often let in the
-- meantime (leegstandswet). Whether it is for sale or for rent follows from the prices it has, so the offer type goes.
-- A listing's price moves to the purchase price for a sale and to the rent for a rental, and a search profile's price
-- range to the purchase or the rent range of what it looked for.

alter table market.listings
  add column purchase_price numeric(12, 2) check (purchase_price > 0),
  add column rent_price numeric(12, 2) check (rent_price > 0);

update market.listings set purchase_price = price where offer_type = 'sale';
update market.listings set rent_price = price where offer_type = 'rent';

-- The price per m² is computed from the price; dropping the offer type drops the indexes and the status check on it.
alter table market.listings
  drop column price_per_m2,
  drop column price,
  drop column offer_type;

alter table market.listings
  add column price_per_m2 numeric(10, 2) generated always as (round(purchase_price / living_area, 2)) stored,
  add column for_sale boolean generated always as (purchase_price is not null) stored,
  add column for_rent boolean generated always as (rent_price is not null) stored,
  add constraint listings_priced check (purchase_price is not null or rent_price is not null),
  -- Sold needs a purchase price, let a rent.
  add constraint listings_status_offered check ((status <> 'sold' or purchase_price is not null) and (status <> 'let' or rent_price is not null));

create index listings_purchase_idx on market.listings (status, purchase_price) where purchase_price is not null;
create index listings_rent_idx on market.listings (status, rent_price) where rent_price is not null;
create index listings_place_idx on market.listings (place_id, published_at desc);
create index listings_type_idx on market.listings (property_type);

alter table members.search_profiles
  add column for_sale boolean not null default false,
  add column for_rent boolean not null default false,
  add column min_purchase_price numeric(12, 2) check (min_purchase_price >= 0),
  add column max_purchase_price numeric(12, 2) check (max_purchase_price >= 0),
  add column min_rent_price numeric(12, 2) check (min_rent_price >= 0),
  add column max_rent_price numeric(12, 2) check (max_rent_price >= 0);

update members.search_profiles
set for_sale = true, min_purchase_price = min_price, max_purchase_price = max_price
where offer_type = 'sale';

update members.search_profiles
set for_rent = true, min_rent_price = min_price, max_rent_price = max_price
where offer_type = 'rent';

-- Dropping these drops the matching index and the range check on them.
alter table members.search_profiles
  drop column offer_type,
  drop column min_price,
  drop column max_price;

alter table members.search_profiles
  add constraint search_profiles_offer check (for_sale or for_rent),
  add constraint search_profiles_purchase_range check (min_purchase_price is null or max_purchase_price is null or max_purchase_price >= min_purchase_price),
  add constraint search_profiles_rent_range check (min_rent_price is null or max_rent_price is null or max_rent_price >= min_rent_price);

create index search_profiles_matching_idx on members.search_profiles (for_sale, for_rent) where active;

drop type market.offer_type;
