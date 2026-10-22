---
title: REST API
description: The API every resource gets, with filters, writes, errors and the typed client.
---

- [Generated REST API](/reference/api/#routes): List, get, create, update and delete endpoints for every resource, following the AIP API design guidelines.
- [OpenAPI and reference](/reference/api/#meta-and-openapi-per-caller): An OpenAPI 3.1 document and an API reference page, each showing only what the caller may see and do.
- [Filters](/reference/api/#filters): AIP-160 filters and ordering, with full-text search, lists of values and relative dates.
- [Counts, facets and charts](/reference/api/#routes): Endpoints for value counts, grouped sums and averages, records over time, histograms and paging to any row.
- [Map queries](/reference/api/#maps): The records inside a map's view, or counts per area when there are many.
- [Related names and photos](/reference/api/#related-names): A list response can carry the names of related records and each record's first photos.
- [ETags](/reference/api/#writes): Every record has a version, and a write based on an old version is refused.
- [Minimal responses](/reference/api/#writes): A create or update can answer without the record, to save the transfer.
- [Batch writes](/reference/api/#batch-writes): Up to 500 creates, updates, deletes and reorders across resources in one transaction.
- [Record permissions](/reference/api/#record-permissions): Responses say which records and fields the caller may change.
- [Scan guard](/reference/api/#safety): Reads that would scan a large table without an index are refused, with the index to create.
- [Statement timeouts](/reference/api/#safety): Every request runs with a time limit, and reads run read-only.
- [Errors](/reference/api/#errors): Every error is a problem document with a stable type and per-field details.
- [Audit events](/reference/api/#audit-events): Reveals of sensitive values and organization changes are published as audit events.
- [Error reporting](/reference/api/#error-reporting): Server and admin app errors go to a Sentry-compatible error tracker when a DSN is set.
- [JWT authentication](/reference/api/#authentication): The API accepts tokens from another identity provider, or a check of your own.
- [CORS](/reference/api/#cors): Websites on other origins can call the API once their origins are listed.
- [Typed client](/reference/client/): A typed fetch client and React hooks for the API.
