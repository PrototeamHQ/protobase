---
title: Workflows
description: Graphs of steps the server runs along their edges, written in a language a model writes well, with every step kept in a trace.
---

- [Workflows](/reference/workflows/#turning-them-on) (beta): Workflows kept in the app's database, each changed definition checked and kept as a version, run on the app's own jobs.
- [Workflow language](/reference/workflows/#the-document) (beta): The States Language with JSONata expressions, every value read by name, so a model writes and edits it as a small, local change.
- [Checked on save](/reference/workflows/#reading-values-by-name) (beta): A definition that does not fit the language, has an edge to no step, reads a value nothing gives or leaves out an argument its step type needs is refused, naming the step and the field.
- [Workflow editor](/reference/workflows/#the-editor) (beta): The admin app draws a workflow as a graph that lays itself out, to add, connect and remove steps and fill in each step's form, with every problem the save would refuse shown on its step as it is edited.
- [Branches, steps per item and retries](/reference/workflows/#states) (beta): Choices, a step per item with their results merged, waits, and per-step retries, timeouts and error paths.
- [HTTP request step](/reference/workflows/#apphttp) (beta): Calls a URL built at run time through the outgoing-address guard, only at public addresses unless the config allows private ones, reading at most 10 MiB of the answer as JSON, text or a file.
- [Records steps](/reference/workflows/#apprecords) (beta): Create, update, get and list records as the workflow's last editor, with the roles they hold now.
- [Mail step](/reference/workflows/#appmailsend) (beta): Sends mail, with files the run downloaded attached, from the app's own sender.
- [Runs and their traces](/reference/workflows/#traces) (beta): Each run started by hand through the API or from the app's code keeps every step's input, output, logs, timing, tries and error as a JSONL trace in the app's private file storage, written without holding up the run, secrets blanked out; every run, only failing ones, or none, set by the app, the workflow or the run.
- [Runs that survive restarts](/reference/workflows/#how-a-run-is-run) (beta): A run takes up where it stood after a restart or a crashed worker from checkpoints that hold only what it needs to go on, never sending mail, writing a record or posting twice, and every limit fails closed.
- [Steps that are not done twice](/reference/workflows/#step-types) (beta): A read whose result expires or works once, such as a signed URL from a mail, is marked `DoNotRepeat` and kept with the time it was fetched; the check warns when a Wait sits between it and its use.
- [Same values after a crash](/reference/workflows/#reading-values-by-name) (beta): `$now`, `$millis`, `$random` and `$shuffle` give a step the same values each time it runs, and each Map item its own.
- [Who may run workflows](/reference/workflows/#who-may-do-what) (beta): Making, changing and running workflows and reading their runs are each granted by name, within the tenant.
- [Workflows over MCP](/reference/mcp/#workflows) (beta): AI clients find, write, validate, change by a small edit and test-run workflows as the signed-in person, and read each step of a run to fix the one that failed.
