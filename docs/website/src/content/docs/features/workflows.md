---
title: Workflows
description: Graphs of steps the server runs along their edges, written in a language a model writes well, with every step recorded.
---

- [Workflows](/reference/workflows/#turning-them-on) (beta): Workflows kept in the app's database, each changed definition checked and kept as a version, run on the app's own jobs.
- [Workflow language](/reference/workflows/#the-document) (beta): The States Language with JSONata expressions, every value read by name, so a model writes and edits it as a small, local change.
- [Checked on save](/reference/workflows/#reading-values-by-name) (beta): A definition that does not fit the language, has an edge to no step, reads a value nothing gives or leaves out an argument its step type needs is refused, naming the step and the field.
- [Workflow editor](/reference/workflows/#the-editor) (beta): The admin app draws a workflow as a graph that lays itself out, to add, connect and remove steps and fill in each step's form, with every problem the save would refuse shown on its step as it is edited.
- [Branches, steps per item and retries](/reference/workflows/#states) (beta): Choices, a step per item with their results merged, waits, and per-step retries, timeouts and error paths.
- [HTTP request step](/reference/workflows/#apphttp) (beta): Calls a URL built at run time through the outgoing-address guard, only at public addresses unless the config allows private ones, reading at most 10 MiB of the answer as JSON, text or a file.
- [Records steps](/reference/workflows/#apprecords) (beta): Create, update, get and list records as the workflow's last editor, with the roles they hold now.
- [Mail step](/reference/workflows/#appmailsend) (beta): Sends mail, with files the run downloaded attached, from the app's own sender.
- [Runs and step records](/reference/workflows/#runs-and-their-steps) (beta): Each run started by hand through the API or from the app's code, with every step's input, output, logs, timing, tries and error recorded, secrets blanked out.
- [Runs that survive restarts](/reference/workflows/#how-a-run-is-run) (beta): A run takes up where it stood after a restart or a crashed worker, never running a saved step again, and every limit fails closed.
- [Who may run workflows](/reference/workflows/#who-may-do-what) (beta): Making, changing and running workflows and reading their runs are each granted by name, within the tenant.
- [Workflows over MCP](/reference/mcp/#workflows) (beta): AI clients find, write, validate, change by a small edit and test-run workflows as the signed-in person, and read each step of a run to fix the one that failed.
