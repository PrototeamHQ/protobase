---
title: REST API
description: The API every resource gets, with filters, writes, errors and the typed client.
---

- [Generated REST API](/reference/api/#routes): List, get, create, update and delete endpoints for every resource, following the AIP API design guidelines.
- [OpenAPI and reference](/reference/api/#meta-and-openapi-per-caller): An OpenAPI 3.1 document and an API reference page, each showing only what the caller may see and do.
- [Filters](/reference/api/#filters): AIP-160 filters and ordering, with word search across a resource's search fields, lists of values and relative dates.
- [Lists under a record](/reference/api/#lists-under-a-record): `/objectives/40/tasks` lists what belongs to one record, by a relation or a declared link, after reading that record as the caller would.
- [Filtering through related records](/reference/api/#filtering-through-related-records): A list asks for the records that belong to another with a subfilter, such as an objective's tasks, in one read under the caller's access, instead of sending a list of keys. The filter can keep to one page of those records, with their sort, limit and page token, and follow a JSON list of keys they hold.
- [Counts, facets and charts](/reference/api/#routes): Endpoints for value counts, grouped sums and averages, records over time, histograms and paging to any row.
- [Map queries](/reference/api/#maps): The records inside a map's view, or counts per area when there are many.
- [Related names and photos](/reference/api/#related-names): A list response can carry the names of related records and each record's first photos.
- [ETags](/reference/api/#writes): Every record has a version, and a write based on an old version is refused.
- [Minimal responses](/reference/api/#writes): A create or update can answer without the record, to save the transfer.
- [Batch writes](/reference/api/#batch-writes): Up to 500 creates, updates, deletes, reorders and moves across resources in one transaction.
- [Record permissions](/reference/api/#record-permissions): Responses say which records and fields the caller may change.
- [Scan guard](/reference/api/#safety): Lists, searches and facets on a column no index serves are refused, at any table size, with the index to create.
- [Statement timeouts](/reference/api/#safety): Every request's queries stop after 1 second by default, with an error that names the request, and reads run read-only.
- [Errors](/reference/api/#errors): Every error is a problem document with a stable type and per-field details.
- [Audit events](/reference/api/#audit-events): Reveals of sensitive values and organization changes are published as audit events.
- [Error reporting](/reference/api/#error-reporting) (beta): Server and admin app errors go to a Sentry-compatible error tracker when a DSN is set.
- [JWT authentication](/reference/api/#authentication): The API accepts tokens from another identity provider, or a check of your own.
- [CORS](/reference/api/#cors): Websites on other origins can call the API once their origins are listed.
- [Typed client](/reference/client/): A typed fetch client and React hooks for the API.
