# Conventions

Conventions every Protobase repo follows.

- Open-source Protobase is never less capable for developers than protobase-cloud: anything generic (it would make sense in any Protobase app, such as auth methods, policies, the assistant API, tools, widgets, MCP) is built in protobase first; protobase-cloud keeps only running the platform and the business (plans, billing, AI credits, metering, the chatbot MCP server) and moves generic code it finds to protobase when it touches it.
- The native API is always at least as capable as any compatible API Protobase serves (such as the Supabase-compatible paths); a gap is closed in the native API first, and examples are built on it.
- Apps and tools built on Protobase use its built-in features rather than mechanisms of their own, even at a small cost; a missing feature is built in Protobase, and removing custom code from an app is a win.
- UI work reuses an existing framework component or mechanism (a view's actions, exported primitives) before drawing anything; a lookalike reuses the original instead of restyling it by hand; a missing piece extends the framework.
- Apps never rebuild CRUD with custom pages: every record keeps its standard `/<resource>/<key>` address and API; a different look comes from the framework (list presentations, a custom record view), and a need it cannot express extends it.
- Resource paths are never hard-coded: parameter names are exported constants, one exported function builds each path, and a dedicated React hook parses it into values.
- A resource whose records point at another through a foreign key is usually shown as an `l.related` table on the record page of the resource it points at.
- Mobile, not phone, is the adjective for layout and UI (mobile bottom bar, mobile drawer); phone names only the device.
- Computed values are real database columns (such as Postgres generated columns), never framework-computed fields, so they can be filtered and indexed.
- Derived state is usually kept by database triggers rather than app code; work that reaches beyond the record being written (scores, comparisons, aggregates) is queued as a job and run when needed, not recalculated at import or write time. Both are preferences, weighed per case.
- Storage Protobase manages in a user's database is avoided when an equally good solution needs none; otherwise it is a table in a schema named for its job (such as `jobs`), never a catch-all `protobase` schema, added by a migration at update time when the config turns it on, with an alternative backend (such as SQS or RabbitMQ) where possible.
- List filters read only indexed columns; the scan guard is never loosened to make a filter work.
- Fields are not locked away because they could be misused: they stay editable by the people who own the data, and a likely-mistaken change asks for confirmation, built in Protobase rather than app code; service-only access is for truly machine-owned fields.
- Protobase sets sensible defaults itself, even where a library it builds on has none or an unsafe one (such as automatic JWKS key rotation).
- Sign-up and sign-in verify the emailed one-time code on its own step, a typical segmented code screen, before asking for anything else; the emailed code stays the default sign-in with a small password link, and setting, changing or resetting a password lives only in account settings.
- Sign-in providers serve organisations, not consumers: Google mainly for Google Workspace, GitHub for developers, Microsoft and custom SSO for organisations and enterprise; Sign in with Apple is parked, so iOS builds offer emailed codes and passkeys only.
- Before 1.0 a breaking change is simply made, in protobase-cloud too: its commit says what breaks and how to adapt, with no migration guide, migration tool, deprecation warning or compatibility shim.
- The build is never faked, such as stamping a Bun marker on output Bun did not build.
