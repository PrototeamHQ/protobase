# Property portal example

A public portal of homes for sale and for rent in the Netherlands and Spain, in the style of Funda and Idealista. A Dutch home for sale is often let in the meantime (leegstandswet), so a listing can be offered both ways. Visitors browse and filter the listings without signing in; members keep search profiles that alert them to new listings, save favorites and write notes, which nobody else sees. A real Postgres 18 database, seeded deterministically with Dutch and Spanish places, agencies and listings, published over the year up to 2026-10-12.

This is not the [real estate example](../real-estate/README.md), which is the back office of one letting agency.

## Start

The database sits beside the other examples' in the same Postgres container, as `property_portal`.

```sh
bun run db:up                                                # repository root: docker compose up, creates the property_portal database and .env from .env.example
bun run --cwd examples/property-portal db:migrate
bun run --cwd examples/property-portal db:seed --scale small  # small | medium | large
bun run --cwd examples/property-portal map:tiles              # the listing map's tiles, in a terminal of its own
bun run --cwd examples/property-portal dev                    # http://localhost:5173
bun run --cwd examples/property-portal test                   # the unit tests next to the config, the jobs and the seed
```

Sign in with one of the seeded accounts, all with the password `property-portal-demo`:

| Account | |
| --- | --- |
| `anna@portal.example` | a member buying around Amsterdam, and buying or renting near Haarlem, with instant alerts |
| `bram@portal.example` | a member renting in Madrid, with a daily digest |
| `admin@portal.example` | runs the catalogue: places, agencies and listings, drafts included |

Other scripts: `db:reset` (drop, migrate, seed small), `typecheck`, `serve` (`protobase build`, then `protobase serve dist` on port 8787). More accounts: `bun run --cwd examples/property-portal protobase users create you@example.com --generate-password` makes a member; `--role admin` an admin. The database tests are the repository's `bun run test:integration`.

Connection string, which scripts read from `DATABASE_URL`:

```
postgres://protobase:protobase@localhost:55432/property_portal
```

## Who sees what

Everything is decided by the roles in `config/roles.ts`, passed to the server; no resource has rules of its own.

| Role | Reads | Writes |
| --- | --- | --- |
| `anonymous` (no token) | published listings without the agent's name and phone, their photos, agencies, places: each through a [field list](https://docs.protobase.net/reference/access/#capabilities) | nothing |
| `member` | published listings with the agent, photos, agencies, places; their own search profiles, alerts, favorites and notes | their own profiles, favorites and notes; whether their alerts are seen |
| `admin` | the catalogue, drafts too; their own member data like anyone else | the catalogue |

A member's rows are theirs through `.owner((r) => r.user_id)` and `.own` capabilities: every list, read, change and delete is limited to rows whose `user_id` is the signed-in user, and a new note, favorite or profile is created as theirs whatever the request says. Admins hold the same `.own` capabilities, so they do not read members' notes either. Alerts carry the profile's owner, and a foreign key on `(search_profile_id, user_id)` keeps the two the same.

Visitors get the admin app too: it opens on the home page and the listings, read-only, with a **Sign in** button in the sidebar ([Browsing the admin app](https://docs.protobase.net/reference/access/#browsing-the-admin-app)). Signing in adds the member's own pages: favorites, alerts, notes and search profiles.

## Screens

- **Find a home** (`config/home/page.tsx`): what is on offer and the newest listings; for a member also their new alerts and favorites.
- **Listings**: cards with the cover photo and arrows through the listing's other photos, address, status, the purchase price or else the rent per month in bold, area, bedrooms and energy label, and the place and agent at the bottom, or a table; filters for sale or rent (a home offered both ways shows under each), place, type, purchase price, rent, area, bedrooms, energy label, status, garden, balcony and parking. A listing's page shows it on a map (`l.map`), lists its photos and, for a member, their notes on it, with **Save to favorites**, **Remove from favorites** (`protobase.ui.tsx`) and **Add a note**, which opens the note form with the listing chosen.
- **Favorites**, **Alerts**, **Notes** and **Search profiles**: the member's own lists. An alert links to its listing and can be marked seen; a profile lists its alerts.

## Alerts

1. Publishing a listing, inserting it with a `published_at` or giving a draft one, enqueues the `match-listing` job in the same transaction (`db/migrations/005_listing_published.sql`).
2. The job (`jobs/match-listing.ts`) reads the active search profiles looking to buy or rent the way the listing is offered, keeps those it fits (`jobs/match.ts`: the purchase price within the profile's purchase range or the rent within its rent range, minimum living area and rooms, type, energy label or better, and the place or the circle of `radius_km` around its centre) and records an alert for each, once.
3. For an instant profile it enqueues `email-alerts`, which mails the member the alerts that have not gone out and marks them mailed. `daily-alerts` runs at 07:00 in Amsterdam and does the same for daily profiles, in one digest per member.

Mail goes through the app's SMTP server, `PROTOBASE_SMTP_URL` and `PROTOBASE_MAIL_FROM` in `.env` ([Jobs: Mail](https://docs.protobase.net/reference/jobs/#mail)). Without them alerts are still recorded and shown in the app, and stay unmailed. Jobs run inside `protobase dev` and `protobase serve`.

## Tables

| Schema | Tables |
| --- | --- |
| `market` | `places` (centre as `latitude`, `longitude`), `agencies`, `listings`, `listing_photos` |
| `members` | `search_profiles` (to buy, to rent or both, with a purchase and a rent range), `alerts` (unique per profile and listing), `favorites` (unique per member and listing), `notes` |
| `auth`, `jobs` | Better Auth's accounts and the job queue, written by `protobase migration` |

Postgres keeps these rules itself:

- A listing has a `purchase_price`, a `rent_price` (per month) or both. `for_sale` and `for_rent` are generated from them, and `price_per_m2` from the purchase price and living area, so they filter and sort like any column.
- A listing is `sold` only with a purchase price and `let` only with a rent, and has fewer bedrooms than rooms. Energy labels are an enum ordered best first, from A++++ to G.
- `published_at` is empty for a draft; only admins read drafts.

## Map

The listing page draws the listing's `latitude` and `longitude` on a map with the style `PROTOBASE_MAP_STYLE_URL` names ([Maps](https://docs.protobase.net/reference/ui-config/#maps)); without it the page has no map. In development that is `http://localhost:8790/style.json`, from `bun run map:tiles` (`map/tiles.ts`): a proxy to a bucket of OpenMapTiles in one PMTiles archive, with its sprites and fonts. The bucket answers only its own sites' origins, so the proxy adds CORS headers for any origin and points the bucket's style at itself; it only reads the bucket, and needs the network. The archive covers the Benelux and the British Isles in detail, so a Spanish listing shows its pin on an empty map. A deployed portal points `PROTOBASE_MAP_STYLE_URL` at a style and archive of its own, served with CORS for its origins.

## Photos

Listings and their photos point at PNG files in the public file provider, such as `public:listings/house-3.png`. The seed draws them (`seed/photos/`, a few dozen houses, flats and rooms) into `data/files/public`, where `protobase dev` and `serve` look by default, or into `PROTOBASE_FILES_PUBLIC` when that is a `file://` URL. They need no network. An admin can upload real photos on a listing's page.

## Scales

| Scale | Listings | Photos | Members | Profiles | Alerts | Seed time (Apple silicon, local Docker) |
| --- | --- | --- | --- | --- | --- | --- |
| small | 400 | 1,750 | 24 | 54 | 128 | under 1 s |
| medium | 20,000 | 87,000 | 2,000 | 4,000 | 140,000 | about 3 s (65 MB) |
| large | 100,000 | 433,000 | 10,000 | 20,000 | 3,130,000 | about 42 s (720 MB) |

`db:seed` truncates the `market` and `members` tables and removes the accounts an earlier seed made (ids starting with `seed-`); accounts made with `protobase users create` stay. Like the other examples', the loader streams `COPY`, drops secondary indexes during the load and rebuilds them afterwards, and records the scale in `public.seed_info`. The publish trigger is off during the load: the seed writes the alerts of the last 30 days itself, with the same matching rule as the job.

## Layout

- `db/migrations/NNN_name.sql`: plain SQL, applied in order by `db/migrate.ts` and recorded in `public.schema_migrations`. The server never migrates.
- `config/`: one folder per table (`data.ts`, `ui.ts`), the roles and the home page. `config/roles.test.ts` checks who sees and writes what, `config/config.test.ts` runs the server's startup checks.
- `jobs/`: the alert jobs, with the matching rule and the mail text tested next to them.
- `map/`: the development map tiles proxy, tested next to it.
- `seed/`: `world.ts` builds everything from the scale, `builders/` one place, agency, listing or member from its ordinal, `steps/` write them, `photos/` draws the pictures.
- `tests/examples/property-portal/` (in the repository root): `smoke.test.ts` checks counts and rules of the seed, `access.integration.test.ts` what two members and a visitor see and may do through the API, `alerts.integration.test.ts` a publish through to the alert and its mail.
