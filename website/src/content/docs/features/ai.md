---
title: AI
description: Fields and actions filled by a model, the assistant beside the admin, and MCP.
---

- [AI fields](/reference/ai/#ai-fields): A model fills a field from a prompt that uses the record's other fields, after each change.
- [AI actions](/reference/ai/#ai-actions): A button asks a model to write a field now, such as a suggested priority or a translation.
- [Assistant](/reference/assistant/): A chat beside the admin that answers questions about the app, reads its data and proposes changes for approval.
- [Choice of model](/reference/assistant/#which-backend): The assistant runs on OpenRouter or any OpenAI-compatible endpoint, also a local one.
- [Assistant tools](/reference/assistant/#the-apps-own-tools): Your own tools for the assistant, acting on records as the user.
- [MCP server](/reference/mcp/#the-tools): AI clients connect to the app over MCP as the signed-in person, and list, find and read records within that person's access, soft-deleted ones too when asked.
- [MCP counts](/reference/mcp/#the-tools): AI clients count the records a filter finds, in all or per value of a field such as a status, without reading the records.
- [MCP result size](/reference/mcp/#result-size): Every tool result fits what AI clients take, as valid JSON: long values are cut and named, a page holds fewer records, and the client reads the rest in pieces.
- [MCP writes](/reference/mcp/#writes): When turned on, for every resource or only those you list, AI clients create, update and delete records after the person approves each write.
- [MCP writes without approval](/reference/mcp/#writes-without-approval): Roles you name, such as service accounts, write over MCP without being asked to approve each write; everyone else is still asked.
- [MCP comments](/reference/mcp/#comments): AI clients read a record's comments, and with MCP writes on add one after the person approves it.
- [MCP batch writes](/reference/mcp/#batch-writes): When MCP writes are on, AI clients make many creates, updates and deletes across resources in one transaction, after the person approves the batch.
- [Connected apps](/reference/auth/#oauth-for-mcp-clients): People allow an AI client to sign in, and disconnect it later.
