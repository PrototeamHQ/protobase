---
title: Workflows
description: Graphs of steps the server runs along their edges, written in a language a model writes well, with every step recorded.
---

- [Workflows](/reference/workflows/#turning-them-on) (beta): Workflows kept in the app's database, each save a new version, run on the app's own jobs.
- [Workflow language](/reference/workflows/#the-language) (beta): The States Language with JSONata expressions, every value read by name, so a model writes and edits it as a small, local change.
- [Checked on save](/reference/workflows/#reading-values-by-name) (beta): A definition that does not fit the language, has an edge to no step or reads a value nothing gives is refused, naming the step and the field.
- [Branches, steps per item and retries](/reference/workflows/#states) (beta): Choices, a step per item with their results merged, parallel branches, waits, and per-step retries, timeouts and error paths.
- [HTTP request step](/reference/workflows/#http) (beta): Calls a URL built at run time, only at public addresses, reading at most 10 MiB of the answer.
- [Runs and step records](/reference/workflows/#runs-and-their-steps) (beta): Each run started through the API or from the app's code, with every step's input, output, logs, timing, tries and error, secrets redacted.
- [Runs that survive restarts](/reference/workflows/#how-a-run-is-run) (beta): A run takes up where it stood after a restart or a crashed worker, never running a saved step again.
- [Who may run workflows](/reference/workflows/#who-may-do-what) (beta): Making, changing and running workflows and reading their runs are each granted by name.
