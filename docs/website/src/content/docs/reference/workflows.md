---
title: Workflows
description: Workflows written as state machines in the States Language with JSONata, checked on every save, run step by step on the app's jobs, with every step recorded.
---

:::caution[Beta]
Workflows run when they are started through the API or from the app's code. Triggers, sign-in connections to other services, MCP tools for them and a graph editor are not built yet.
:::

A **workflow** is a graph of steps that the server runs one after another along its edges: fetch something, decide, run a step per item, merge the results. It is written in the **States Language**, the JSON language of state machines, with **JSONata** as its expression language, in a profile of it that reads every value by name. A language model writes and changes it as easily as a person, and the same definition is what the server checks and runs. Each run records every step it takes, with what the step read, gave and logged.

## Turning them on

```ts
import { defineConfig } from '@protobase/config'

export default defineConfig({ workflows: {} })
```

It adds four resources, over a `workflows` schema that [`protobase migration`](/reference/cli/#migration) writes (`NNN_workflows.sql`), and the `workflows.segment` [job](/reference/jobs/) that runs them:

| Resource | |
| --- | --- |
| `workflows` | A name, a description and the definition. Each save that changes the definition is checked, and kept as the workflow's next version. |
| `workflow_versions` | Every version of every definition as it was saved, with who saved it and when. Read-only. |
| `workflow_runs` | A run, started by creating it with `workflow_id` and an `input`; it runs the version its workflow had then. Its status, output, error and timing are written by the runner. |
| `workflow_steps` | Every step of every run. Read-only. |

| `workflows` | |
| --- | --- |
| `schema` | The schema of its tables, for a database that has a `workflows` schema already. Default `workflows`. |
| `allowPrivateAddresses` | Lets the `http` step reach private, loopback and link-local addresses, for development and tests. Default false. |

## The language

A definition names its first state and its states; each state goes on to the one its `Next` names, or ends the run with `End`. Every value in it is JSON, and a string written as `{% ... %}` is a JSONata expression, evaluated when the state runs:

```json
{
  "QueryLanguage": "JSONata",
  "StartAt": "Fetch",
  "States": {
    "Fetch": {
      "Type": "Task",
      "Resource": "http",
      "Arguments": { "url": "{% 'https://api.example.com/orders?since=' & $trigger.since %}" },
      "Assign": { "orders": "{% $states.result.body.items %}" },
      "Retry": [{ "ErrorEquals": ["Http.StatusError"], "IntervalSeconds": 5, "MaxAttempts": 3 }],
      "Next": "Any"
    },
    "Any": {
      "Type": "Choice",
      "Choices": [{ "Condition": "{% $count($orders) > 0 %}", "Next": "Each" }],
      "Default": "Nothing"
    },
    "Each": {
      "Type": "Map",
      "Items": "{% $orders %}",
      "ItemProcessor": {
        "StartAt": "Total",
        "States": { "Total": { "Type": "Pass", "Output": "{% $states.input.quantity * $states.input.price %}", "End": true } }
      },
      "Assign": { "totals": "{% $states.result %}" },
      "Next": "Report"
    },
    "Report": { "Type": "Succeed", "Output": "{% { 'orders': $count($orders), 'total': $sum($totals) } %}" },
    "Nothing": { "Type": "Succeed", "Output": "{% { 'orders': 0 } %}" }
  }
}
```

The definition holds no layout: an editor lays the graph out from its edges.

### Reading values by name

Every value a state reads has a name, so a step can be moved or added without the data around it shifting:

- `$trigger` is the run's input, in every state.
- An earlier step's result is read by the variable a state's `Assign` gave it, such as `$orders` above. A state's `Assign` is evaluated before its own variables change; a variable assigned inside a Map's item processor or a Parallel's branch stays inside it, and those inner states read the outer variables too.
- `$states.result` is a Task's, Map's or Parallel's result, in its own `Output` and `Assign`; `$states.errorOutput` is the caught error (`Error` and `Cause`), in a catcher's `Output` and `Assign`.
- `$states.input` is the item, in the first state of a Map's item processor only.

A definition is checked against the profile's JSON Schema (`definitionSchema` of `@protobase/workflows`) and its rules on every save. The save is refused, naming each state and field, when a field does not belong to its state or has the wrong type, a `Next`, `Default` or catcher names no state, a state is never reached, a Task names a step type the app does not have, an expression does not parse, or an expression reads anything but the names above: the state's input as JSONata's context (a bare field name, `$`, `$$`), `$states.input` outside an item's first state, a variable no state in its scope assigns, or `$eval`. The problem's `problems` lists them as `{ state, field, message }`, where a state inside a Map or Parallel is named by its path, such as `Each/Total`.

### States

| Type | |
| --- | --- |
| `Task` | Runs a step type, its `Resource`, with its `Arguments`; `TimeoutSeconds` (default 60, at most 300), `Retry` and `Catch`. |
| `Pass` | Shapes values with `Output` and `Assign`, and goes on. |
| `Choice` | Goes to the `Next` of the first of its `Choices` whose `Condition` is true, else to its `Default`; with neither it fails with `States.NoChoiceMatched`. |
| `Wait` | Waits `Seconds`, or until a `Timestamp` (ISO 8601), as a number or an expression. |
| `Map` | Runs its `ItemProcessor` once per item of `Items`, at most `MaxConcurrency` at once (default and most 20); its result is the items' outputs in order. |
| `Parallel` | Runs each of its `Branches` with the same input; its result is the branches' outputs in order. |
| `Succeed` | Ends the run, or the Map item or branch, with its `Output`. |
| `Fail` | Ends it as failed with its `Error` and `Cause`. |

A state's output is its `Output`, else its result (a Task, Map or Parallel) or the input it was given; the next state is given it as its input. Fields that read a state's input implicitly (`InputPath`, `Parameters`, `ResultPath` and the other fields of the JSONPath language) are not part of the profile.

### Errors and retries

A failing Task, Map or Parallel fails with an error name: a step type's own, such as `Http.StatusError`, `States.Timeout` when it ran past its timeout, `States.TaskFailed` for any other error it threw, and `States.QueryEvaluationError` for an expression that did not evaluate. The first retrier whose `ErrorEquals` names it tries the state again after `IntervalSeconds` (default 1), times `BackoffRate` (default 2) for each earlier retry, up to `MaxDelaySeconds`, `MaxAttempts` times (default 3). Once none is left, the first catcher that names it goes on to its `Next`; without one the run fails. `States.ALL` names every error but `States.DataLimitExceeded` and `States.Runtime`, which end the run.

## Step types

### http

One request to a URL built at run time:

| Argument | |
| --- | --- |
| `url` | An http or https URL. |
| `method` | `GET` (default), `HEAD`, `POST`, `PUT`, `PATCH` or `DELETE`. |
| `headers` | An object of text values. |
| `query` | An object of text values, added to the URL's query. |
| `body` | Text is sent as it is; any other value as JSON, with `content-type: application/json` unless a header says otherwise. |

The result is `{ status, headers, body }`, with the body parsed when the answer says it is JSON, and without the cookies the answer sets. A status from 300 up fails the step with `Http.StatusError`; a redirect is never followed. The step resolves the URL's host when it runs and refuses it, with `Http.AddressRefused`, unless every address is public, then connects to the very address it checked, so a URL built from a webhook's payload cannot reach the app's own network. It reads at most 10 MiB of the answer's body: a larger one fails the step with `Http.ResponseTooLarge`, rather than being cut short.

<gap>Workflows cannot read or write the app's records or send mail because those step types are not implemented.</gap>

## Runs and their steps

A run starts when it is created, through the API or the admin app, in the same transaction: `POST /api/v1/workflow_runs` with `{ "workflow_id": "...", "input": { ... } }`. From the app's own code, such as a job or a write hook, `startWorkflow(db, { workflow, input, tenant, startedBy })` from `@protobase/server` starts one in `db`'s transaction, so it starts when the caller's writes commit, or not at all. With a `key`, such as `orders:42`, a workflow runs once per key: a start with a key it has a run for already, in this transaction or another, starts nothing and returns that run's id.

<gap>Workflows cannot start on a webhook, an event or a schedule because triggers are not implemented.</gap>

Each step is saved as it ends, as a `workflow_steps` record: the state, its type, the scope it ran in (empty for the run itself, `Each.3[0]` for item 0 of the Map `Each` that was step 3), its number, its try, its status (`succeeded`, `retrying`, `caught` or `failed`), its input, output and assigned variables, its logs, when it started and ended and how long it took, its error and cause, and where it goes on to. In a Task's recorded input, every field whose name says it holds a secret, such as `Authorization`, `token`, `password` or `apiKey`, is `[redacted]`. A run's status is `queued`, `running`, `waiting` (with the time it goes on), `succeeded` with its output, or `failed` with its error and cause.

## Who may do what

The workflow resources take only [named grants](/reference/access/#resources-that-need-named-grants): a role's wildcard such as `*.read` reaches none of them, since a run reads and sends data as its definition says.

| Grant | |
| --- | --- |
| `workflows.create`, `workflows.update`, `workflows.delete` | Make, change and delete workflows. |
| `workflow_runs.create` | Run a workflow, with any input. |
| `workflows.read`, `workflow_versions.read`, `workflow_runs.read`, `workflow_steps.read` | Read workflows, their versions, runs and steps, the steps' inputs and outputs included. |

```ts
defineRoles({
  admin: ['*'],
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read'],
})
```

All four are scoped to the tenant like any resource with `.tenant()`; a run takes its workflow's tenant, and refuses a workflow of another.

## How a run is run

The runner is `@protobase/workflows`, a package with no other Protobase dependency, over a narrow port: where runs and steps are kept (here the `workflows` schema), the queue that runs them (here the app's [jobs](/reference/jobs/)), and the step types.

- A run is run in **segments**, each a `workflows.segment` job: one runs the run from where it stands to its next wait, then queues the next. A Wait, or a retry's delay, saves its step with the time the run goes on, ends the segment and queues the next one for that time, so a waiting run holds no worker. A segment hands the rest of the run on after a minute of steps.
- Where a run stands is read from its saved steps. Each step is saved with **one statement**, unique by its scope and number, so a second segment of the same run saves nothing and stops.
- A worker that stops or dies mid-step leaves that step unsaved: its job is tried again and takes the run up from its last saved step, so a saved step never runs again, and the step that was in progress runs **at least once**. Every try of a step gets the same idempotency key, for a step type whose receiver dedupes by it. A job whose worker died is tried again once its timeout, 10 minutes, has passed.
- A Map's items and a Parallel's branches run in the segment that reaches them, each item's steps saved under its own scope; an item that waits ends the segment once the others running settle, and the next segment takes each item up where it stands. A Map's `Items` is evaluated again by a segment that takes up an unfinished Map.
- JSONata runs in the server's process with a time limit of a second and a depth limit per expression; it reaches no file, network or code of the app.

| Limit | |
| --- | --- |
| A Task's `TimeoutSeconds` | 60 by default, at most 300. |
| A Map's items | 10,000. |
| A Map's `MaxConcurrency`, a Parallel's branches | 20. |
| Steps of one run, every try and item counted | 50,000; beyond, the run fails with `States.Runtime`. |
| The input, output and variables a step saves | 1 MiB each, as JSON; beyond, the step fails with `States.DataLimitExceeded`. |
| A Wait | 366 days. |
