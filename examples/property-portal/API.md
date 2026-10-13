# Property portal API walkthrough

Every resource of the portal is also a REST API at `/api/v1/<resource>`, described by an OpenAPI 3.1 document the server generates for the caller: `/api/openapi.json`, with an interactive reference at `/api/docs`. Both list only what the caller's role may see and do, so they need a token ([REST API](https://docs.protobase.net/reference/api/)).

Start the example as in the [README](README.md#start); the commands below use `curl` and `jq` against `http://localhost:5173`.

```sh
BASE=http://localhost:5173
```

## Sign in and get a token

Sign in with a seeded account, keeping the session cookie, then exchange the session for an API token. The token lasts 15 minutes; ask for a new one the same way.

```sh
curl -s -c cookies.txt "$BASE/api/auth/sign-in/email" \
  -H 'content-type: application/json' \
  -d '{"email":"admin@portal.example","password":"property-portal-demo"}' > /dev/null
TOKEN=$(curl -s -b cookies.txt "$BASE/api/auth/token" | jq -r .token)
```

## The OpenAPI document

```sh
curl -s "$BASE/api/openapi.json" -H "authorization: Bearer $TOKEN" | jq '.paths | keys | map(select(startswith("/listings")))'
```

## List published listings

Visitors need no token: without one the request is the `anonymous` role, which reads published listings only, without the agent.

```sh
curl -s -G "$BASE/api/v1/listings" \
  --data-urlencode "filter=for_sale = true AND status = 'available'" \
  --data-urlencode "order_by=published_at desc" \
  --data-urlencode "fields=id,address,purchase_price,published_at" \
  --data-urlencode "page_size=5" | jq .items
```

## Create a listing as admin and publish it

A new listing without `published_at` is a draft that only admins see. The answer carries its `id` and `etag`.

```sh
CREATED=$(curl -s "$BASE/api/v1/listings" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{
  "agency_id": 1, "place_id": 1, "property_type": "apartment",
  "address": "Prinsengracht 263", "postal_code": "1016 GV", "latitude": "52.375200", "longitude": "4.883900",
  "purchase_price": "650000", "living_area": 85, "rooms": 3, "bedrooms": 2, "energy_label": "b",
  "description": "Canal-side apartment with a view.", "agent_name": "Sanne Visser", "agent_phone": "+31 20 123 4567"
}')
ID=$(echo "$CREATED" | jq -r .id)
ETAG=$(echo "$CREATED" | jq -r .etag)
```

Publishing is setting `published_at`. An update needs the record's `etag` in `If-Match`, so it never overwrites a change it has not seen. Publishing also matches the listing against the members' search profiles ([Alerts](README.md#alerts)).

```sh
curl -s -X PATCH "$BASE/api/v1/listings/$ID" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -H "if-match: $ETAG" -d "{\"published_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" | jq '{id, published_at}'
```

Now visitors see it:

```sh
curl -s "$BASE/api/v1/listings/$ID?fields=id,address,purchase_price,published_at" | jq '{id, address, purchase_price, published_at}'
```
