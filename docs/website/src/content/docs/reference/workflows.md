---
title: Workflows
description: Workflows written as state machines in the States Language with JSONata, checked on every save, run step by step on the app's jobs, with every step kept in a trace.
---

:::caution[Beta]
Workflows run when they are started through the API, over MCP or from the app's code. Triggers and sign-in connections to other services are not built yet.
:::

A **workflow** is a graph of steps that the server runs one after another along its edges: fetch something, decide, run a step per item, merge the results, write records, send mail. It is written in the **States Language**, the JSON language of state machines, with **JSONata** as its expression language, in a profile of it that reads every value by name. A language model writes and changes it as easily as a person, and the same document is what the server checks and runs. Each run keeps a trace of every step it takes, with what the step read, gave and logged, outside the database, which holds only what a run needs to go on.

## Turning them on

```ts
import { defineConfig } from '@protobase/config'

export default defineConfig({ workflows: { secrets: ['TICKETS_TOKEN'] } })
```

It adds three resources, over a `workflows` schema that [`protobase migration`](/reference/cli/#migration) writes (`NNN_workflows.sql`), and the `workflows.segment` [job](/reference/jobs/) that runs them:

| Resource | |
| --- | --- |
| `workflows` | A name, a description and the definition. Each save that changes the definition is checked, and kept as the workflow's next version, saved by the caller. |
| `workflow_versions` | Every version of every definition as it was saved, with who saved it and when. Read-only. |
| `workflow_runs` | A run, started by creating it with `workflow_id`, an `input` and, if it says, its own `trace`; it runs the version its workflow had then. Its status, output, error, timing and trace file are written by the runner. |

| `workflows` | |
| --- | --- |
| `schema` | The schema of its tables, for a database that has a `workflows` schema already. Default `workflows`. |
| `secrets` | The environment variables workflows may read, by name. Startup stops when one is unset or shorter than 8 characters. |
| `allowPrivateAddresses` | Lets the `app:http` step reach private, loopback and link-local addresses, for development and tests. Default false. |
| `trace` | Which runs keep a [trace](#traces): `all` (default), `failed` or `none`. Any other value stops startup. |
| `scratch` | `{ dir, maxSize }`: a local folder, such as a scratch disk, that keeps copies of runs' large files and values, at most `maxSize` (default `1 GB`), read before the private file provider. |

Runs keep their traces, the files steps store and large values in the app's `private` [file provider](/reference/files/), local disk under `data/files/private` unless `PROTOBASE_FILES_PRIVATE` names an S3 bucket, so an app with workflows needs a files secret: `secret`, `files.secret`, `PROTOBASE_FILES_SECRET` or `PROTOBASE_SECRET`.

Records steps act as each workflow's last editor, with the roles the project's sign-in gives them now. A project that signs people in otherwise exports its own, `async ({ id, tenant }) => [...]`, as the default of `workflows/saved-by-roles.ts` (`createAdmin` takes it as `workflows.savedByRoles`); without either, startup stops.

## The document

A definition is one JSON document: the workflow's trigger, and the state machine a run runs from `StartAt`. Every state names where the run goes next, and every value in it is JSON; a string written as `{% ... %}` is a JSONata expression, evaluated when the state runs, and keeps its value's type.

```json
{
  "trigger": { "record": { "events": ["orders.created"] } },
  "stateMachine": {
    "QueryLanguage": "JSONata",
    "StartAt": "Charge",
    "States": {
      "Charge": {
        "Type": "Task",
        "Resource": "app:http",
        "Arguments": {
          "method": "POST",
          "url": "https://payments.example.com/charges",
          "body": { "order_id": "{% $states.context.Execution.Input.after.id %}", "amount": "{% $states.context.Execution.Input.after.total %}" }
        },
        "Retry": [{ "ErrorEquals": ["States.ALL"], "IntervalSeconds": 10, "MaxAttempts": 3, "BackoffRate": 2 }],
        "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "MarkFailed", "Assign": { "chargeError": "{% $states.errorOutput %}" } }],
        "End": true
      },
      "MarkFailed": {
        "Type": "Task",
        "Resource": "app:records.update",
        "Arguments": { "resource": "orders", "key": "{% $states.context.Execution.Input.after.id %}", "data": { "status": "payment_failed" } },
        "Next": "TellOps"
      },
      "TellOps": {
        "Type": "Task",
        "Resource": "app:mail.send",
        "Arguments": {
          "to": "ops@example.com",
          "subject": "{% 'Payment failed for order ' & $states.context.Execution.Input.after.id %}",
          "text": "{% $chargeError.Cause %}"
        },
        "End": true
      }
    }
  }
}
```

The document holds no layout: the [editor](#the-editor) lays the graph out from its edges.

### Triggers

`trigger` holds exactly one of these; its payload is the run's input.

| Trigger | Starts a run | The input holds |
| --- | --- | --- |
| `"webhook": {}` | on each POST to the workflow's webhook address | `{ body, headers, query }` |
| `"schedule": { "cron", "timezone" }` | on a 5-field cron, in an IANA time zone (default `UTC`) | `{ scheduled_at }`, ISO 8601 with the zone's offset |
| `"mail": { "mailbox" }` | on each mail arriving in that mailbox | `{ from, to, subject, text, html, received_at, attachments }` |
| `"record": { "events": ["<resource>.<event>"] }` | on each of those record events, such as `deals.created` | `{ event, resource, key, after, before, changed }` |
| `"manual": {}` | when someone runs the workflow by hand | the input they give |

A save checks a trigger's shape; runs start through the API, over MCP or from the app's code. <gap>A webhook, schedule, mail or record trigger cannot start runs because the triggers are not implemented.</gap>

### Reading values by name

Every value a state reads has a name, so a step can be moved or added without the data around it shifting:

| Name | Holds |
| --- | --- |
| `$states.context.Execution.Input` | the run's input, the same in every state |
| `$states.context.Execution.StartTime` | when the run started, ISO 8601 |
| `$states.context.Secrets.<NAME>` | the secret of that name, one `workflows.secrets` lists |
| `$<variable>` | a value an earlier state assigned with `Assign` |
| `$states.result` | a Task's or Map's result, in its own `Output` and `Assign` |
| `$states.errorOutput` | the caught error, `{ Error, Cause }`, in a catcher's `Output` and `Assign` |
| `$states.input` | the item, in the first state of a Map's item processor only |

A state's `Assign` is evaluated with the variables as they were when the state was entered; the new values are seen from the next state on. States inside a Map read the outer variables but may not assign one of the same name.

JSONata's `$now()` and `$millis()` give the time of the run's last [checkpoint](#how-a-run-is-run) in the state's scope, not the clock: the run's start, then the time a recorded step's result was fetched, or a Wait's or retry's end. In a recorded Task's own `Output` and `Assign` they give the time its result was fetched, so `"Assign": { "fetched": "{% $now() %}" }` keeps it. `$random()` and `$shuffle()` draw from a generator seeded by the run, the step's place and its try, so Map items running at once each get their own numbers. A step run again after a crash thus computes the same values.

The save is refused, naming each state and field, when the document does not fit the profile:

- a field does not belong to its state or has the wrong type, or the trigger is not exactly one of the above, with a 5-field cron and a known time zone;
- a `Next`, `Default` or catcher names no state, a state is never reached, or a state name is used twice, Maps included;
- a Task names a step type the app does not have, or the state type is not one of Task, Choice, Pass, Map, Wait, Succeed and Fail;
- an expression does not parse, or reads anything but the names above: the state's input as JSONata's context (a bare field name, `$`, `$$`), `$states.input` outside an item's first state, `$states.context` but for the three reads above, a variable no state that can run before it assigns, or `$eval`;
- a limit below is passed.

The problem's `problems` lists them as `{ state, field, message }`, where a state inside a Map is named by its path, such as `Each/Total`. The document's JSON Schema is `definitionSchema` of `@protobase/workflows`, and `checkDefinition` runs the whole check.

`definitionWarnings` finds what a save takes but may go wrong, in the same shape: a state that reads, after a Wait, a variable a step marked `DoNotRepeat` assigned before it, such as a signed URL that may have expired by then. `validate_workflow`, `create_workflow` and `update_workflow` return them as `warnings`. <gap>The editor cannot show a definition's warnings because drawing them on their step is not implemented.</gap>

<gap>A save cannot refuse a Task's missing or unknown argument because checking `Arguments` per step type is not implemented.</gap> The step fails its run instead, with an error such as `Http.InvalidArguments` whose cause names the argument.

### States

| Type | |
| --- | --- |
| `Task` | Runs a step type, its `Resource`, with its `Arguments`; `TimeoutSeconds`, `Retry`, `Catch` and `DoNotRepeat`. |
| `Pass` | Shapes values with `Output` and `Assign`, and goes on. |
| `Choice` | Goes to the `Next` of the first of its `Choices` whose `Condition` is true, else to its `Default`; with neither it fails with `States.NoChoiceMatched`. A rule may carry its own `Output` and `Assign`. |
| `Wait` | Waits `Seconds`, or until a `Timestamp` (ISO 8601), as a number or an expression. |
| `Map` | Runs its `ItemProcessor` once per item of `Items`, at most `MaxConcurrency` at once (0, the default, means the most, 20); its result is the items' outputs in order. |
| `Succeed` | Ends the run, or the Map item, with its `Output`. |
| `Fail` | Ends it as failed with its `Error` and `Cause`. |

A state's output is its `Output`, else its result (a Task or Map) or the input it was given. A definition's `trace`, `all`, `failed` or `none`, sets which of its runs keep a [trace](#traces). Fields that read a state's input implicitly (`InputPath`, `Parameters`, `ResultPath` and the other fields of the JSONPath language), and `Parallel`, are not part of the profile.

### Errors and retries

A failing Task or Map fails with an error name: a step type's own, such as `Http.Status`, `States.Timeout` when it ran past its timeout, `States.TaskFailed` for any other error it threw, and `States.QueryEvaluationError` for an expression that did not evaluate or ran past its limits. The first retrier whose `ErrorEquals` names it tries the state again after `IntervalSeconds` (default 1), times `BackoffRate` (default 2) for each earlier retry, up to `MaxDelaySeconds`; `MaxAttempts` counts the retries after the first try (default 3, 0 for none). Without `Retry` a failure is not retried. Once no retry is left, the first catcher that names it goes on to its `Next`; without one the run fails. `States.ALL` names every error but `States.DataLimitExceeded` and `States.Runtime`, which end the run even where a retrier or catcher names them.

## The editor

A workflow's record page in the admin app, `/workflows/<id>`, and its create form draw the definition as a graph to edit, and save the same document the API saves:

- **The graph lays itself out.** The trigger is on top, each state is a box, a Map is a box around the states it runs for each item, and each edge is drawn from the field that names it: a state's `Next`, a Choice's rules (labelled with their condition) and its `Default` ("Otherwise"), and a Task's or Map's catchers ("On error", dashed). The graph is laid out by ELK's layered algorithm, from top to bottom, each time a state or edge is added, removed or renamed; the document keeps no positions, so the graph a person sees is the one a model or the API wrote, and the one they edit is what a model reads back. The page scrolls under the wheel; the canvas zooms with its buttons and by pinching.
- **Adding a step.** *Add a step* adds a Task of a step type, or a Choice, Map, Wait, Pass, Succeed or Fail, named `Step 1`, `Step 2` and so on. It goes into the Map chosen, or the Map the chosen step is in, else into the workflow; it ends the run, or its item, until it is connected, and in a workflow or Map without steps it is the first.
- **Connecting steps.** Drag from a step's handle to another step, or tap one handle and then the other: the bottom handle sets `Next`, a Choice's *When* handle adds a rule and its *Otherwise* handle sets `Default`, a Task's or Map's *On error* handle adds a catcher of `States.ALL`, and the trigger's handle sets `StartAt`. A step leads only to steps of its own machine, so an edge into or out of a Map is refused. The chosen step's form sets the same edges with menus: *Goes on to*, each rule's and catcher's *Then goes to*, and *Otherwise goes to*.
- **Removing.** Delete or Backspace removes the chosen step or edge, as does the form's *Remove step*. Removing a step removes the edges to it: a `Next` to it becomes `End`, and a rule, `Default` or catcher naming it goes. Removing the first step of a workflow or Map makes the first step left in it the first.
- **A step's form.** Choosing a step opens its form under the graph: its name, which renames every edge to it, then what its type takes. A Task's form has a field for each argument of its step type, the ones it needs marked, as listed under [Step types](#step-types); a Choice's its rules and `Default`; a Map's `Items` and `MaxConcurrency`; a Wait's `Seconds`; a Pass's and a Succeed's `Output`; a Fail's `Error` and `Cause`. A field takes text, an expression (`{% ... %}`) or JSON; an emptied field is left out. *The step as JSON* edits every field of the step, such as `Retry`, `Assign` and `TimeoutSeconds`. The trigger's form picks the trigger and its schedule, mailbox or events.
- **Problems on their step.** The editor runs the same check as a save on every change, and shows each problem on the step it names, as a count on its box and a list and a marked field in its form; a problem with the trigger or the first step shows on the trigger, and one about the whole document above the graph. Saving writes the definition through the API, where the save hook checks it again: a definition with a problem is refused with the 400 above, whose `errors` hold each problem for the `definition` field, with its state and field in `params`.

A save also refuses a Task that leaves out an argument its step type needs, such as `app:http` without `url`, unless its `Arguments` is one expression, whose value is known only when it runs. A user who may read a workflow but not change it sees the same graph and forms, locked. <gap>The editor cannot undo a single change because an undo history is not implemented.</gap>

## Step types

A step's call either changes the world, such as mail sent, a record written or a `POST`, or only reads, such as a `GET`, a record read or a list. A call that changes the world is **recorded**: its checkpoint is saved before the run goes on, so it never happens twice in a run. A read is done again when a crash comes before the next checkpoint. `"DoNotRepeat": true` on a Task records a read too, for a result that expires or works once, such as a signed URL from an incoming mail; a step type may make it its default, which `"DoNotRepeat": false` turns off.

### app:http

One request to a URL built at run time:

| Argument | |
| --- | --- |
| `url` | An http or https URL. |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH` or `DELETE`. |
| `headers`, `query` | Objects of text values; `query` is added to the URL's query. |
| `body` | Text is sent as it is, a file value as its bytes with its type, any other value as JSON; a `GET` sends none. |
| `response` | How the answer's body is read: `json` (default, parsed; empty is `null`), `text`, or `file`, kept as a file of the run. |

A `GET` only reads; every other method is recorded. The result is `{ status, headers, body }`, without the cookies the answer sets. A status outside 2xx fails the step with `Http.Status`, whose cause names the status and holds at most the first 200 characters of the body, secrets blanked out first; a redirect is never followed. `Http.Network` is a request that got no answer. The step resolves the URL's host when it runs and refuses it with `Http.AddressRefused` unless every address is public, then connects to the very address it checked, so a URL built from a webhook's payload cannot reach the app's own network. It reads at most 10 MiB of the answer's body: a larger one fails the step with `Http.ResponseTooLarge`, rather than being cut short.

### app:records

| Step type | Arguments | Result |
| --- | --- | --- |
| `app:records.create` | `resource`, `data`: an object of field values, or a list of them, created in one batch: all or none | the created record, or the list of them |
| `app:records.update` | `resource`, `key`, `data` | the updated record |
| `app:records.get` | `resource`, `key` | the record |
| `app:records.list` | `resource`, optional `filter` (the API's filter syntax), `order_by`, `limit` | `{ records }` |

A get and a list only read; a create and an update are recorded. They go through the app's API as the user who saved the run's version, with the roles that user holds now in the run's tenant, so its access rules, tenant scope, validation and write hooks apply as they do to that user's own requests. Whoever may start a run (`workflow_runs.create`) thus has it do what the workflow's last editor may do; a workflow never does more. When that user holds no role any more, or the version was saved by the app's code, the step fails with `Records.Refused`, as it does for a refusal of the API, its status and message in the cause. A number for a decimal field is written as its text; a file field takes a file value the run keeps.

### app:mail.send

| Argument | |
| --- | --- |
| `to` | One address, or a list of at most 50, each one address. |
| `subject` | One line of text. |
| `text`, `html` | The body as text, and optionally as HTML. |
| `attachments` | A list of file values the run keeps, at most 10 MiB together. |

The mail goes from the app's own sender with the app's mailer; a workflow cannot set the sender. The result is `{ message_id }`, the Message-ID the step sets, the same for each try of the step. Without mail the step fails.

### app:piece

`piece`, `action`, `connection` and `props` name an action of a connector and its arguments. A save takes it, and a run fails it with `Piece.Error`. <gap>A piece step cannot run an action because its handler is not implemented.</gap>

### File values

A file value is `{ uri, name, type, size }`, the handle to bytes in the app's storage that the API returns for a file field. `app:http` with `response: "file"` keeps the answer as a file of the run, in the `private` file provider under the run's id; steps take only the files of their own run, so a workflow cannot attach, send or store another file of the app's by naming its URI. <gap>A workflow cannot send or attach a file it read from a record because steps reading the app's other files is not implemented.</gap>

## Runs and their steps

A run starts when it is created, through the API or the admin app, in the same transaction: `POST /api/v1/workflow_runs` with `{ "workflow_id": "...", "input": { ... } }`. The input is at most 1 MiB as JSON and nests at most 64 levels; a larger one is refused with `input-too-large` or `input-too-deep` and no run. From the app's own code, such as a job or a write hook, `startWorkflow(db, { workflow, input, tenant, startedBy, trace })` from `@protobase/server` starts one in `db`'s transaction, so it starts when the caller's writes commit, or not at all. With a `key`, such as `orders:42`, a workflow runs once per key: a start with a key it has a run for already, in this transaction or another, starts nothing and returns that run's id.

A run's status is `queued`, `running`, `waiting` (with the time it goes on), `succeeded` with its output, or `failed` with its error and cause.

### Traces

A run's **trace** keeps every step it took, one JSON object a line (JSONL): the state, its type, the scope it ran in (empty for the run itself, `Each.3[0]` for item 0 of the Map `Each` that was step 3), its number, its try, its status (`succeeded`, `retrying`, `caught` or `failed`), its input, output and assigned variables, its logs, when it started and ended, its error and cause, where it goes on to, and whether it was `recorded`. It is kept in the private file provider, not the database: each segment writes the steps it ran as a part under `workflows/<run>/trace/` in the background, once its checkpoints are saved, so the run never waits for it; the segment that ends the run joins the parts into `workflows/<run>/trace.jsonl`, which the run's **Trace** field (`trace_file`) then offers to download. <gap>The run's page cannot list the trace's steps one by one because a trace view is not implemented.</gap> A step a crash made run again is in the trace once for each time it ran to the end of its segment. A trace that cannot be written goes to the app's error report (`onUnhandledError`), and the run goes on.

Every run keeps a trace by default. The run's own `trace` (set as it is started), else its workflow definition's `trace`, else the config's `workflows.trace` says which: `all`, `failed`, which keeps the trace of a run that fails and drops the parts of one that succeeds, or `none`.

### Secrets

A workflow reads a secret only by name, `$states.context.Secrets.TICKETS_TOKEN`, and only one the config's `workflows.secrets` lists; the values are never part of the definition. Every value of the listed secrets is blanked out as `[redacted]` wherever it appears in what a run records: a step's input, output, variables, logs, error and cause, and the run's output, error and cause, in the database and in the trace alike. In a Task's input, every field whose name says it holds a secret, such as `Authorization`, `token` or `apiKey`, is blanked out too. A value an expression computes from a secret, however it changes it, such as `'Basic ' & $base64encode(...)`, is kept whole as `[redacted]`: in a Task's `Arguments` the step type gets the value and the record keeps `[redacted]`; in an `Output`, an `Assign`, a Map's `Items` or a Fail's `Error` and `Cause` the value itself is `[redacted]`, so later states read that. Read a secret in the `Arguments` of the Task that sends it. A secret that comes back changed in a step's result, such as one a server encodes in its answer, is not the value the runner looks for, and is kept as it came. A run's input is kept as its caller gave it, so a secret's value never belongs in it.

## Over MCP

An AI client signed in to the app's [MCP endpoint](/reference/mcp/#workflows) finds, makes, changes and test-runs workflows as the person: it lists the step types and triggers with their arguments, reads and validates definitions, saves one whole or by a small edit, starts a run with an input, and reads each step of the run's trace with its input, output, logs and error. The endpoint's instructions describe this language, and a refused definition comes back with its problems, each naming the state and field.

## Who may do what

The workflow resources take only [named grants](/reference/access/#resources-that-need-named-grants): a role's wildcard such as `*.read` reaches none of them, since a run reads and sends data as its definition says.

| Grant | |
| --- | --- |
| `workflows.create`, `workflows.update`, `workflows.delete` | Make, change and delete workflows. Each save that changes the definition makes the saver the workflow's last editor, whom its records steps act as. |
| `workflow_runs.create` | Run a workflow, with any input. The API writes only the fields a caller reads, so it goes with `workflow_runs.read`, and the caller must read the workflow too. |
| `workflows.read`, `workflow_versions.read`, `workflow_runs.read` | Read workflows, their versions and runs, the runs' traces with every step's input and output included. |

```ts
defineRoles({
  admin: ['*'],
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'],
})
```

All three are scoped to the tenant like any resource with `.tenant()`. A run takes its workflow's tenant; a start of another tenant's workflow is refused as one of a workflow that is not there.

## How a run is run

The runner is `@protobase/workflows`, a package with no other Protobase dependency, over a narrow port: where runs and their checkpoints are kept (here the `workflows` schema), the queue that runs them (here the app's [jobs](/reference/jobs/)), the step types, and where traces go (here the private file provider).

- A run is run in **segments**, each a `workflows.segment` job whose payload is the run's id alone: one runs the run from where it stands to its next wait, then queues the next. A Wait whose time is still ahead, or a retry's delay, saves a checkpoint with the time the run goes on, ends the segment and queues the next one for that time, so a waiting run holds no worker. A segment hands the rest of the run on after a minute of steps.
- The database keeps only what a run needs to go on: per scope (the run, or a Map item) its latest **checkpoint**, where it stands: the state it goes on to with that state's input, its variables, the try of a state being retried, and its clock. A checkpoint is saved after a recorded step (a call that changes the world, or one marked `DoNotRepeat`, whose small result it keeps with the time it was fetched), after a Wait or a retry's delay, and for every scope that moved as the segment pauses; a step that only computes or reads saves nothing. A checkpoint's values larger than 16 KiB go to a file of the run in the private file provider, and the row keeps its path. A run that ends drops its checkpoints, and a run of only such steps that ends in its segment writes none. <gap>A run's files, its large values included, stay in the private file provider after it ends because deleting them is not implemented.</gap>
- Each save is **one statement**, which replaces a scope's checkpoint only when that is the one the segment took the scope up from, so a second segment of the same run that fell behind stops.
- A worker that stops or dies mid-step leaves that step unsaved: its job is tried again and takes each scope up from its last checkpoint, so a recorded call never happens again, and the steps since run **at least once**: computing steps give the same values, as their clock and random numbers are the checkpoint's, and reads are done again. A value read before a Wait carries over it in the variables; read after the Wait for fresh data. A call whose effect happened before its checkpoint was saved, such as a request that was sent, happens again. Every try of a step gets the same idempotency key, for a step type whose receiver dedupes by it, and `app:mail.send` makes it the mail's Message-ID. A job whose worker died is tried again once its timeout, 10 minutes, has passed.
- A Map's items run in the segment that reaches them, each under its own scope; an item that waits ends the segment once the others running settle, the items that ended are saved as ended, and the next segment takes each item up where it stands. A Map's `Items` is evaluated again by a segment that takes up an unfinished Map.
- With `scratch`, the runner also keeps the run's files and large values on that local folder, the least recently used dropped beyond its size, and reads them there first; the private provider's copy is what a run relies on.
- JSONata runs in the server's process under a time and a depth limit per expression; it reaches no file, network or code of the app.

Every limit fails closed: a run or step that passes one fails, rather than going on with less.

| Limit | |
| --- | --- |
| A definition | 256 KiB as JSON, 100 states, Maps included; an expression 4,096 characters. |
| An expression's evaluation | 1 second, and 300 levels deep; beyond, `States.QueryEvaluationError`. |
| A Task's `TimeoutSeconds` | 300 by default, and at most. |
| A retrier's `MaxAttempts` | 19. |
| The wait before a retry | 1 day, however `BackoffRate` grows it. |
| A Map's items | 10,000; beyond, the Map fails with `States.DataLimitExceeded` before any item runs. |
| A Map's `MaxConcurrency` | 20. |
| Steps of one run, every try and item counted | 50,000; beyond, the run fails with `States.Runtime`. |
| The input, output and variables of a step | 1 MiB each, as JSON; beyond, the step fails with `States.DataLimitExceeded`. |
| A step's logs | 100 lines of 1,000 characters; more lines are left out with a last line saying how many. |
| A run's input | 1 MiB as JSON, 64 levels deep. |
| An answer `app:http` reads, a file a run keeps | 10 MiB. |
| A Wait | 366 days, by `Seconds` or `Timestamp`. |
