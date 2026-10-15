-- A listing may give its position only roughly, as many Spanish portals do to keep the home's door private: false
-- here, and the listings' map draws its marker as approximate.
alter table market.listings add column position_exact boolean not null default true;
