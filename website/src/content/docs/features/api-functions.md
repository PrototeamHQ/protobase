---
title: API functions
description: Endpoints of your own beside the REST API.
---

- [API functions](/guides/api-functions/#a-first-function): Each file in `functions/` becomes an endpoint for signed-in callers, reloaded while you work.
- [Records as the caller](/guides/api-functions/#reading-and-writing-records-as-the-caller): Functions read and write records with the caller's access, validation and hooks.
- [Input checks](/guides/api-functions/#checking-input): Request bodies are checked with zod, Valibot or another Standard Schema validator.
- [Roles for functions](/guides/api-functions/#roles): A function can be limited to roles or a capability.
- [Public functions and webhooks](/guides/api-functions/#public-functions-and-webhooks): A function can be open to anyone, with helpers that check webhook signatures.
- [WebSockets](/guides/api-functions/#websockets): A function can accept a WebSocket, and the caller is checked again every minute.
- [Hono apps](/guides/api-functions/#hono-apps): A function with several routes can be a Hono app.
- [Long queries](/guides/api-functions/#long-queries): A function or job that does bulk work may run queries for up to 30 seconds, on a connection kept for it.
