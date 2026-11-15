# Example apps

The examples in `tests/apps` are the presets, and `automations` is what `protobase-try.exe` serves, so a change that makes the server need more of a schema it checks at startup, such as a bump of `workflowsVersion`, ships each example's migration with it: `bun run protobase migration` in `tests/apps/<name>`, on a database its own migrations made. `packages/cli/tests/project/examples-schema.integration.test.ts`, in the integration tests, serves every example on its own migrations and fails while one is behind.
