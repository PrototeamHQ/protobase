---
title: Workflows
description: Workflows written as state machines in the States Language with JSONata, checked on every save, run step by step on the app's jobs, with every step kept in a trace.
---

:::caution[Beta]
Workflows run when they are started through the API, over MCP, from the app's code or by a test run in the admin app, and from record triggers. They also run from webhook and polling triggers, within the limits named at the start of their sections.
:::

A **workflow** is a graph of steps that the server runs one after another along its edges: fetch something, decide, run a step per item, merge the results, write records, send mail. It is written in the **States Language**, the JSON language of state machines, with **JSONata** as its expression language, in a profile of it that reads every value by name. A language model writes and changes it as easily as a person, and the same document is what the server checks and runs. Each run keeps a trace of every step it takes, with what the step read, gave and logged, outside the database, which holds only what a run needs to go on.

## Turning them on

```ts
import { defineConfig } from '@protobase/config'

export default defineConfig({ workflows: { secrets: ['TICKETS_TOKEN'] } })
```

It adds five resources, over a `workflows` schema that [`protobase migration`](/reference/cli/#migration) writes (`NNN_workflows.sql`), and the `workflows.segment` [job](/reference/jobs/) that runs them:

| Resource | |
| --- | --- |
| `workflows` | A name, a description and the definition. Each save that changes the definition is checked, and kept as the workflow's next version, saved by the caller. |
| `workflow_versions` | Every version of every definition as it was saved, with who saved it and when. Read-only. |
| `workflow_runs` | A run, started by creating it with `workflow_id`, an `input` and, if it says, its own `trace`, and a saved `version` to run another than the published one, or on a workflow that is off the one saved last, or with `rerun_of` to [re-run a failed run](#re-running-a-failed-run), and `replay: true` too to [replay a run](#replaying-a-run); it runs the version its workflow had then, and a re-run or a replay the input of the run it names. Its status, output, error, timing and trace file are written by the runner. |
| `workflow_triggers` | The trigger of each enabled workflow that has one besides `manual`: its type, status and last error. Read-only. |
| `workflow_resolutions` | Each time someone [marked a workflow resolved](#run-status), by whom and when. Created only. |

With `storage` it adds a sixth, `storage_configurations`, the places workflows [store files](#storing-files) in.

| `workflows` | |
| --- | --- |
| `schema` | The schema of its tables, for a database that has a `workflows` schema already. Default `workflows`. |
| `secrets` | The environment variables workflows may read, by name. Startup stops when one is unset or shorter than 8 characters. |
| `allowPrivateAddresses` | Lets the `app:http` step, and every plugin's `fetch`, reach private, loopback and link-local addresses, for development and tests. Default false. |
| `plugins` | Packages of [workflow plugins](/reference/workflow-plugins/) to run, by name, beside the app's own in `workflows/plugins/<name>.ts`. |
| `trace` | Which runs keep a [trace](#traces): `all` (default), `failed` or `none`. Any other value stops startup. |
| `storage` | Turns on [storage configurations](#storing-files): `root`, the one folder local configurations live inside, and `endpoints`, the `https://` origins an S3-compatible configuration may name. Needs `PROTOBASE_ENCRYPTION_KEY`. |

Runs keep their traces and the files steps store in the app's `private` [file provider](/reference/files/), local disk under `data/files/private` unless `PROTOBASE_FILES_PRIVATE` names an S3 bucket, so an app with workflows needs a files secret: `secret`, `files.secret`, `PROTOBASE_FILES_SECRET` or `PROTOBASE_SECRET`.

Records steps act as the user who saved the run's version, with the roles the project's sign-in gives them now. A project that signs people in otherwise exports its own, `async ({ id, tenant }) => [...]`, as the default of `workflows/saved-by-roles.ts` (`createAdmin` takes it as `workflows.savedByRoles`); without either, startup stops.

## The document

A definition is one JSON document: the workflow's trigger, and the state machine a run runs from `StartAt`. Every state names where the run goes next, and every value in it is JSON; a string written as `{% ... %}` is a JSONata expression, evaluated when the state runs, and keeps its value's type.

```json
{
  "trigger": { "app:record": { "resource": "orders", "when": "status = 'placed'" } },
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
          "body": { "order_id": "{% $states.context.Execution.Input.record.id %}", "amount": "{% $states.context.Execution.Input.record.total %}" }
        },
        "Retry": [{ "ErrorEquals": ["States.ALL"], "IntervalSeconds": 10, "MaxAttempts": 3, "BackoffRate": 2 }],
        "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "MarkFailed", "Assign": { "chargeError": "{% $states.errorOutput %}" } }],
        "End": true
      },
      "MarkFailed": {
        "Type": "Task",
        "Resource": "app:records.update",
        "Arguments": { "resource": "orders", "key": "{% $states.context.Execution.Input.record.id %}", "data": { "status": "payment_failed" } },
        "Next": "TellOps"
      },
      "TellOps": {
        "Type": "Task",
        "Resource": "app:mail.send",
        "Arguments": {
          "to": "ops@example.com",
          "subject": "{% 'Payment failed for order ' & $states.context.Execution.Input.record.id %}",
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

`trigger` holds one key: `manual`, or a trigger type `<plugin>:<key>` with its input. The built-in ones are the `app` plugin's; a [workflow plugin](/reference/workflow-plugins/) adds its own the same way, and `list_workflow_types` over MCP lists them all with their inputs.

| Trigger | Starts a run | The input holds |
| --- | --- | --- |
| `"manual": {}` | when someone runs the workflow by hand | the input they give |
| `"app:record": { "resource", "when", "key" }` | once per record that becomes ready | `{ resource, key, record }` |
| `"app:webhook": { "auth", "body_limit", "per_minute", "idempotency_header" }` | once per signed call of its [URL](#appwebhook) | `{ method, query, headers, body, received_at }` |
| `"app:schedule": { "cron", "timezone" }` | at each time of the [cron](#appschedule) | `{ scheduled_at }` |

A save checks a trigger's input against its type, and refuses a type the app does not have; besides triggers, runs start through the API, over MCP, from the app's code or by a [test run](#test-runs). A plugin's [polling and webhook triggers](/reference/workflow-plugins/#polling-and-webhook) run as these do.

### Turning a trigger on

A trigger starts runs only while its workflow is published: set `enabled_version` to any saved version through the API, in the admin app or with `enable_workflow` over MCP, and clear it to turn the workflow off. The trigger is registered at once on every server process, with no restart, and its status, `active` or `failing` with its last error, is the workflow's `workflow_triggers` record. A save makes a new version and changes nothing that is live, so a change can be run and tested first; publishing it moves `enabled_version`, and publishing an older version goes back to it. A published version whose trigger has the same type and input as the one before keeps the running trigger as it is, and any other change stops it and starts the new one. Runs in progress stay on their version. A trigger's runs run the enabled version and act as the user who saved it, as any run acts as its version's saver.

### app:record

```json
{ "app:record": { "resource": "invoices", "when": "status = 'sent' AND due_at <= now() - 3d", "key": ["due_at"] } }
```

Starts one run for each record of `resource` that becomes ready, with `{ resource, key, record }` as the run's input, so the record's fields are read as `$states.context.Execution.Input.record.<field>`. Without `when`, every record is ready once it exists, so each new record starts one run.

- **`when`** is a [filter](/reference/api/#filters) on the resource's filterable fields. `now()` may stand only in AND terms of the form `<timestamp or date field> <= now() - <duration>` (or `<`): such a term says when a record becomes ready, and the run starts at that time with no write, such as three days after an invoice's `due_at`. Any other use of `now()`, such as inside an OR, `search()` and `similar()` are refused at save, naming the term.
- **One run per ready key:** the record's key, plus the values of the `key` fields. A record that stays ready over later writes starts no second run; one whose `due_at` changes is ready again under a new key.
- **Who reads it:** the record is read through the API as the user who saved the enabled version, in the workflow's tenant, and `when` is checked on what they may read, so a record they cannot read, or a field they cannot see, never reaches a run. A saver who holds no role any more, or whom the API refuses, marks the trigger `failing`; the next write it reads a record on makes it active again, and it then passes over the records it missed. A key field the saver cannot read marks it `failing` too.
- **When it looks:** a write to the resource, through the API or the database, reaches the trigger through [events](/reference/events/), so the resource must declare some; turning a workflow on also starts runs for the records ready already, 100 per job. No periodic sweep runs.

<gap>A workflow cannot start on every write of a record because an every-change trigger is not implemented; a record trigger starts once per ready key.</gap> <gap>An owner is not told when a trigger starts failing because trigger alerts are not implemented.</gap>

### app:webhook

:::caution[Beta]
The rate limits count per server process, not across the app's processes, and `hmac` and `bearer` calls carry no signed time, so a captured call can be sent again while its secret holds.
:::

```json
{ "app:webhook": { "auth": { "mode": "standard_webhooks" }, "body_limit": 1048576, "per_minute": 60 } }
```

Starts one run for each call of the workflow's own URL that proves it comes from the sender. Issue the URL with `POST /api/workflows/<id>/webhook`, or `new_webhook_url` over MCP: it answers `{ url, secret }` once, and the app keeps only a hash of the URL's key, so it cannot show them again. Send `{ "secret": "<secret>" }` to keep a secret the sender makes itself, such as a Standard Webhooks sender's `whsec_` secret. A new URL replaces the old one, which stops at once. Issuing needs the right to change that workflow in your tenant; anyone else gets 404.

The sender POSTs to the URL. `auth.mode` says how a call proves it is theirs:

| `auth.mode` | The call carries |
| --- | --- |
| `standard_webhooks` (default) | `webhook-id`, `webhook-timestamp` and `webhook-signature` headers, signed with the secret, at most five minutes off |
| `hmac` | an HMAC of the body in `auth.header`, after `auth.prefix`, in `auth.encoding` (`hex` or `base64`) with `auth.hash` (`SHA-1`, `SHA-256` or `SHA-512`) |
| `bearer` | `Authorization: Bearer <secret>`; the app keeps only the secret's hash |

The run's input is `{ method, query, headers, body, received_at }`: `body` is the JSON, the form fields (a field sent more than once as the list of its values) or the text sent, and a body that makes the input over 256 KiB as JSON, as escaping can before the body itself is, is a [file of the run](#file-values), which needs the app's `private` file provider. `headers` leaves out `authorization`, `cookie`, every `webhook-*` header, the `hmac` signature header and `x-forwarded-*`, and the input never holds the URL, so no credential reaches a run, its steps or its logs. A `standard_webhooks` call starts one run per `webhook-id`, and an `hmac` or `bearer` call one per value of the `idempotency_header` you name, when it sends one; the id is at most 200 characters.

The URL answers `202 { run_id }`, or:

| Status | When |
| --- | --- |
| `404` | the key opens no running webhook trigger: unknown, turned off, deleted, or the enabled version has another trigger |
| `405` | the method is not POST |
| `413` | the body is over `body_limit` bytes (default 1 MiB, at most 10 MiB, counted as it streams) |
| `401` | the call does not carry the secret or a valid signature |
| `429` | over `per_minute` calls that passed the check (default 60), or the client's address was refused 30 times this minute |
| `400` | the id is over 200 characters |

Only calls that pass the check spend `per_minute`, so someone who knows the URL but not the secret cannot use up the sender's calls. Both limits count per server process, so an app on several processes takes up to that many times more. The client's address is the one [`protobase serve`](/reference/cli/#serve) sets from the connection and its trusted proxies; behind another server, the limit is only as good as the `X-Forwarded-For` it sets. `hmac` and `bearer` calls carry no signed time, so a captured call can be sent again while its secret holds, unless the sender's idempotency header stops it; `standard_webhooks` refuses one more than five minutes old. Changing `auth.mode` to `standard_webhooks` or `hmac` after a `bearer` URL needs a new URL, since the app kept only the bearer secret's hash. With the request log on, the log shows the URL's key as `[key]`.

### app:schedule

```json
{ "app:schedule": { "cron": "0 6 * * 1-5", "timezone": "Europe/Amsterdam" } }
```

Starts one run at each time of a five-field cron, in an IANA time zone (default UTC), with `{ scheduled_at }` as the run's input. A time starts one run however many server processes run. The first time missed while no worker ran starts one run, late, once a worker is back; the other times missed meanwhile start none.

### Reading values by name

:::caution[Beta]
`$now()` and `$millis()` give the time of the scope's last checkpoint, not the clock, and `$random()` and `$shuffle()` draw new numbers on each retry of a step.
:::

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

JSONata's `$now()` and `$millis()` give the time of the run's last [checkpoint](#how-a-run-is-run) in the state's scope, not the clock: the run's start, then the time a recorded step's result was fetched, or a Wait's or retry's end. In a recorded Task's own `Output` and `Assign` they give the time its result was fetched, so `"Assign": { "fetched": "{% $now() %}" }` keeps it. `$random()` and `$shuffle()` draw from a generator seeded by the run, the step's place and its try, so Map items running at once each get their own numbers. A step run again after a crash thus computes the same values, except in a recorded Task's own `Output` and `Assign`: a crash before its checkpoint was saved makes it fetch its result again, and `$now()` and `$millis()` there give the time of that new fetch.

The save is refused, naming each state and field, when the document does not fit the profile:

- a field does not belong to its state or has the wrong type, or the trigger is not exactly one of `manual` or an available `<plugin>:<key>` type with input that fits that type's schema;
- a `Next`, `Default` or catcher names no state, a state is never reached, or a state name is used twice, Maps included;
- a Task names a step type the app does not have, or the state type is not one of Task, Choice, Pass, Map, Wait, Succeed and Fail;
- an expression does not parse, or reads anything but the names above: the state's input as JSONata's context (a bare field name, `$`, `$$`), `$states.input` outside an item's first state, `$states.context` but for the three reads above, a variable no state that can run before it assigns, or `$eval`;
- a limit below is passed.

The problem's `problems` lists them as `{ state, field, message }`, where a state inside a Map is named by its path, such as `Each/Total`. The document's JSON Schema is `definitionSchema` of `@protobase/workflows`, and `checkDefinition` runs the whole check.

A save refuses a Task that leaves out an argument its step type needs, as [the editor](#the-editor) describes. <gap>A save cannot refuse a Task's unknown argument because checking `Arguments` against the step type's whole schema at save is not implemented.</gap> The step fails its run instead, with an error such as `Http.InvalidArguments` whose cause names the argument.

### States

| Type | |
| --- | --- |
| `Task` | Runs a step type, its `Resource`, with its `Arguments`; `TimeoutSeconds`, `Retry` and `Catch`. `Cache` reuses the result of an identical earlier call: `true` forces it on, `false` turns it off, and without it the step type decides, as [Caching results](/reference/workflow-plugins/#caching-results) says. |
| `Pass` | Shapes values with `Output` and `Assign`, and goes on. |
| `Choice` | Goes to the `Next` of the first of its `Choices` whose `Condition` is true, else to its `Default`; with neither it fails with `States.NoChoiceMatched`. A rule may carry its own `Output` and `Assign`. |
| `Wait` | Waits `Seconds`, or until a `Timestamp` (ISO 8601), as a number or an expression. |
| `Map` | Runs its `ItemProcessor` once per item of `Items`, at most `MaxConcurrency` at once (0, the default, means the most, 20); its result is the items' outputs in order. |
| `Block` | Runs its `Processor` once as a run of its own on its `Arguments`, and keeps the result for `Cache.Ttl`, as [Blocks](#blocks) says; `Retry` and `Catch` as a Task. |
| `Succeed` | Ends the run, or the Map item, with its `Output`. |
| `Fail` | Ends it as failed with its `Error` and `Cause`. |

A state's output is its `Output`, else its result (a Task or Map) or the input it was given. A definition's `trace`, `all`, `failed` or `none`, sets which of its runs keep a [trace](#traces). Fields that read a state's input implicitly (`InputPath`, `Parameters`, `ResultPath` and the other fields of the JSONPath language), and `Parallel`, are not part of the profile.

### Errors and retries

A failing Task or Map fails with an error name: a step type's own, such as `Http.Status`, `States.Timeout` when it ran past its timeout, `States.TaskFailed` for any other error it threw, and `States.QueryEvaluationError` for an expression that did not evaluate or ran past its limits. The first retrier whose `ErrorEquals` names it tries the state again after `IntervalSeconds` (default 1), times `BackoffRate` (default 2) for each earlier retry, up to `MaxDelaySeconds`; `MaxAttempts` counts the retries after the first try (default 3, 0 for none). Without `Retry` a failure is not retried. Once no retry is left, the first catcher that names it goes on to its `Next`; without one the run fails. `States.ALL` names every error but `States.DataLimitExceeded` and `States.Runtime`, which end the run even where a retrier or catcher names them.

### Blocks

A block wraps steps into one step that runs once while what it reads stays the same. Its steps run as a run of their own, and its result is kept for a time you set, so a workflow that reaches it again, in this run or another, gets that result without running them. Use it for work that must not be repeated, such as fetching a file from a link that expires and storing it: once stored, the stored file is what counts.

```json
"Keep file": {
  "Type": "Block",
  "Arguments": { "url": "{% $states.context.Execution.Input.url %}" },
  "Processor": {
    "StartAt": "Download",
    "States": {
      "Download": { "Type": "Task", "Resource": "app:http", "Arguments": { "url": "{% $states.context.Execution.Input.url %}", "store": { "configuration": "archive" } }, "End": true }
    }
  },
  "Cache": { "Ttl": "1 day" },
  "Assign": { "file": "{% $states.result %}" },
  "Next": "Mail"
}
```

- **What it reads.** `Arguments` is the block's input. Its steps read it as `$states.context.Execution.Input`, and secrets by name; they never read the variables around the block. A variable a step inside assigns stays inside. The block's result is its last step's output, which its `Output` and `Assign` read as `$states.result`.
- **When it runs again.** The block is keyed by the values of its input that its steps read and by the secrets they read, together with its steps as they are written. So a changed value that only a later step reads runs it again, and a value none of them reads does not. `Cache.Key`, an expression, keys it on its value instead. `Cache.Ttl` is how long a result serves, as seconds or text such as `10 minutes`, `1 hour` or `2 days`, at most 30 days; a definition without a valid one is refused. A result is kept under the run's tenant, the version's last editor, the person who turned it on and the accounts it binds, so another run reuses it only when it acts as the same people. A result that is empty is kept too.
- **What is never kept.** A secret: a result that holds a secret's value is not kept, so the next visit runs the block again, and a block reached after a secret it reads changed runs again too. `Arguments` may not hold a secret, since the block's run keeps its input; read it inside the block by name. A result is reused only while the accounts its steps sign in with can still be used.
- **Its own run.** A block's run has its own trace and limits. Its output, like every value a run keeps, is at most 256 KiB; larger data goes through a [storage configuration](#storing-files). On the run's page, the Block step links to the run that gave its result, the earlier one when the result was reused, and that page marks the block's steps from its own trace. Open it to read each step, replay it by itself, or go back to the run that started it. A failed block fails the Block step with the block run's error, which `Retry` and `Catch` take; each try starts a new run of the block. A run waits for its block's run and goes on once that ends.
- **Building one.** In the editor, *Add step* offers *Block*, which comes with one step inside; with the block or one of its steps chosen, *Add step* adds inside it, as for For each.
- **A Wait after it.** When a state reads, after a Wait, a variable a Block set before that Wait, the check warns on that state that what the block fetched may have expired by then. The editor shows the warning on the step and in its form, and MCP clients get it in `warnings`; a save goes through with it.

<gap>Two runs that reach a block with the same key at the same moment cannot share one run of it, because joining a block's run already under way is not implemented.</gap>

## The editor

A workflow's record page in the admin app, `/workflows/<id>`, is a [focus page](/reference/ui-config/#focus-pages): the graph fills the page, and everything you do to it happens beside it. It saves the same document the API saves. A new workflow asks for its name and opens here with no steps and the step picker open. In the admin app's sidebar, Workflows is the only entry, with the workflows listed under it by their [run status](#run-status): a workflow's versions, runs, steps and trigger are on its page, and their resources and API stay as they are.

### The workflow's page

:::caution[Beta]
A version can be published or looked at, not compared with another beyond a count of its changes, the version selector lists only the latest 100, the Runs panel the latest 20, and the graph has no undo.
:::

The bar under the breadcrumb holds what is live, the version shown, *Add step*, *Runs*, how the work stands, *Test run*, *Save* and *Publish*, with the rest behind "...": *Discard changes*, *Workflow details*, *Turn off* and *Delete*. The graph takes the rest of the page; the wheel pans it, and pinching zooms it. Choosing a step opens its form in the panel beside the graph, and the graph makes room. *Workflow details* leads to the workflow's standard form at `?standard=true`, with its name, description and published version and the Trigger, Runs and Versions tables.

- **Save and Publish.** *Save* makes a new version and changes nothing that is live, so a change can be tried first. *Publish* asks in the panel, says what changes and how many steps differ, warns about a version with no test run, and names the trigger it starts. With unsaved changes it saves them first, and a refused save stops there. *Turn off* stops the workflow; runs in progress stay on their version.
- **Versions.** *Version* chooses which saved version the graph shows, each marked as the latest and as live; it lists the latest 100. <gap>The version selector cannot offer a version older than the latest 100 because loading more of them into it is not implemented.</gap> Such a version still opens by its address. The latest version is the one you edit. An older one is read-only, with *Edit latest version* in the notice, and publishing it goes back to it. The version is in the address, `/workflows/<id>?version=<number>`, so a link opens it.
- **Runs.** *Runs* lists the workflow's latest 20 runs in the panel, with status, time, version, how long each took, whether a person or a trigger started it, and its input; each is a link. A run shows as marks on the graph, as [Following and debugging a run](#following-and-debugging-a-run) says. On the latest version the graph stays editable under the marks, so a failure can be read and fixed in one place: a step changed since the run says so. A run of an older version opens from the panel on that version, read-only. The run is in the address, `?run=<id>`, and a run's own address, `/workflow_runs/<id>`, opens the workflow's page with the run on the latest version; for a run of an older version, *Show on version* in the notice shows the version it ran on. *Hide run* takes the marks away.
- **A step's data.** With a run shown, a chosen step's panel has two tabs, *Data* and *Settings*: its error, output, input, variables and logs in the run, and its form. *Use as test input* starts a test run from the run's input, the first step's input or any step's output, and *Copy JSON* copies it whole.
- **Re-run from this step** runs again from the chosen step with the run's input, on the version saved last, and keeps the steps before it as they ran, as [Re-running a run](#re-running-a-failed-run) says. With unsaved changes it saves them first. The panel says what stays, and which steps act again. A kept step stays as it ran, so a change to it is not in the re-run: the panel names the first such step and offers to re-run from there. A variable that keeps a step's whole result is the exception: it gets what the kept step gave, so a value inserted from an earlier step works in a re-run from the step that reads it.
- **Replay without writing**, in the run's panel, runs every step again with the same input, as [Replaying a run](#replaying-a-run) says; steps that write send nothing.
- **Test run** starts a run in the panel, as [Test runs](#test-runs) says.
- **Insert value.** Under a step's field, *Insert value* lists the run's input and each earlier step's output from the run shown, or else the latest run that ended among the 20 in *Runs*, with sample values. Choosing one writes the expression into the field, after what it holds. Values are read by name, so an earlier step's output is read through a variable: when that step has none, it gets one, named after the step, and *Undo* takes it back. A step that shapes its result with `Output` is not offered, since a variable keeps its result before `Output`.

A user who may read a workflow but not change it gets the same page, its fields and graph locked, without Save or Publish. On a mobile screen the bar holds what is live, *Runs* and *Test run*, or *Save* with unsaved changes, and the rest behind "..."; a step's form can be changed, and steps are added on a wider screen.

- **The graph lays itself out.** The trigger is on top, each state is a box, a Map is a box around the states it runs for each item, and each edge is drawn from the field that names it: a state's `Next`, a Choice's rules (labelled with their condition) and its `Default` ("Otherwise"), and a Task's or Map's catchers ("On error", dashed). The graph is laid out by ELK's layered algorithm, from top to bottom, each time a state or edge is added, removed or renamed; the document keeps no positions, so the graph a person sees is the one a model or the API wrote, and the one they edit is what a model reads back. The canvas zooms with its buttons and by pinching.
- **Adding a step.** *Add step* opens a searchable picker in the panel: every step type the app can run, its plugins' included, each with what it does, then Choice, For each item, Wait, Set values, Succeed and Fail. Search finds other words too, such as *email* for Send mail. It says where the step lands, and choosing a step on the graph changes that. A new step is named `Step 1`, `Step 2` and so on, and goes after the chosen step, taking over where it went on to, or after the last step; into the Map chosen; or first, with the trigger chosen. After a Choice or a step that ends the run it stays unconnected, and so does a Succeed or Fail that would cut off the steps after it, such as one added between two steps or first in a workflow that has steps.
- **Connecting steps.** Drag from a step's handle to another step, or tap one handle and then the other: the bottom handle sets `Next`, a Choice's *When* handle adds a rule and its *Otherwise* handle sets `Default`, a Task's or Map's *On error* handle adds a catcher of `States.ALL`, and the trigger's handle sets `StartAt`. A step leads only to steps of its own machine, so an edge into or out of a Map is refused. The chosen step's form sets the same edges with menus: *Goes on to*, each rule's and catcher's *Then goes to*, and *Otherwise goes to*.
- **Removing.** Delete or Backspace removes the chosen step or edge, as does the form's *Remove step*. Removing a step removes the edges to it: a `Next` to it becomes `End`, and a rule, `Default` or catcher naming it goes. Removing the first step of a workflow or Map makes the first step left in it the first.
- **A step's form.** Choosing a step opens its form in the side panel beside the graph: its name, which renames every edge to it, then what its type takes. A Task's form has a field for each argument of its step type's input schema, the ones it needs marked, as listed under [Step types](#step-types) or by its plugin: one line of text for a string, one line for a number or `true` and `false`, a menu for an `enum`, names separated by commas for a list of strings, and JSON for anything else; a Choice's its rules and `Default`; a Map's `Items` and `MaxConcurrency`; a Wait's `Seconds`; a Pass's and a Succeed's `Output`; a Fail's `Error` and `Cause`. A field takes text, an expression (`{% ... %}`) or JSON; an emptied field is left out. *The step as JSON* edits every field of the step, such as `Retry`, `Assign` and `TimeoutSeconds`. The trigger's form picks among the app's triggers, its plugins' included, and draws a field for each input of its schema the same way, such as a record trigger's resource, `when` and `key`.
- **Problems on their step.** The editor runs the same check as a save on every change, and shows each problem on the step it names, as a count on its box and a list and a marked field in its form; a problem with the trigger or the first step shows on the trigger, and the bar counts them all, with the list in the panel. A field left to fill in is not a fault yet: a new step shows no red, and the bar says how many fields are left. Save, Test run and Publish then go to the first of them, which says so. A warning of the check, such as a [Wait after a Block](#blocks), shows on its step as a mark and in its form as something to check, and never stops a save. Until then the draft stays on this browser, through a reload. Saving writes the definition through the API, where the save hook checks it again: a definition with a problem is refused with the 400 above, whose `errors` hold each problem for the `definition` field, with its state and field in `params`.

A save also refuses a Task that leaves out an argument its step type needs, such as `app:http` without `url`, unless its `Arguments` is one expression, whose value is known only when it runs. A user who may read a workflow but not change it sees the same graph and forms, locked. <gap>The editor cannot undo a single change because an undo history is not implemented.</gap> The editor reads the app's types from `GET /api/workflows/types`, `client.workflowTypes()` of `@protobase/client`: the same list `list_workflow_types` gives over MCP, `{ step_types, triggers }`, which only a user who may read workflows gets. A type the app cannot run, such as one that signs in through a connection whose OAuth client the app does not set, is not offered, and the check refuses it with the reason; a stored trigger of such a type, or of a type the app does not have, shows its type and input, read-only. The boxes, their accessible names and a run's step headings name each type by the label the list gives it, such as *Shout* for `acme:shout`.

A Task's form has a *Cache results* switch, unless its step type hides it. For a type whose plugin offers an on and off switch, it turns caching on or off. For any other type, the type decides when it reuses a result, and the switch forces it on for every call. A type whose plugin advises against forcing it on shows its plugin's warning first. Once forced on, its box carries an exclamation mark, also in its accessible name, so a screenshot shows at once that the warning was set aside.

## Connecting an account

:::caution[Beta]
Each connected account belongs to the person who connected it, and only that person can turn on a workflow that uses it.
:::

A trigger or step type that signs in to another service, such as a mailbox, uses an account that someone connected. Each person connects their own accounts on the **Connections** section of the account page's Profile tab. Connecting takes them to the provider and back. Under each account, the section links each workflow that uses it: those the person turned on, whose enabled version binds the account, while they may still change them. The app keeps the account's tokens on the server, encrypted, and refreshes them when they expire. **Disconnect** first makes the triggers on the account wait for a new sign-in, then asks the provider to revoke the token when the connection has a revocation endpoint, and then deletes the account, so no step or trigger can use the token again, even one that was fetching it at that moment. The answer's `revocation` says what became of the token: `revoked` when the provider took it, `queued` when it did not answer or refused, and `not_revoked` when the connection has no revocation endpoint or the token could not be revoked or queued, as when it no longer decrypts with the app's secret; the section shows it. A queued token is tried again later, waiting from a minute up to an hour between tries, ten tries in all. Until then it keeps the token encrypted with the app's secret, in the workflows schema's `connection_revocations`, and drops it once the provider takes it, after the last try, or once the app's secret no longer decrypts it. A provider that never takes it keeps the token valid on its side. When stopping the triggers or deleting the account fails, disconnecting answers that error and keeps the account, and disconnecting again finishes the job. It answers `503` (`CONNECTIONS_STARTING`) and keeps the account while the workflows have not started. Deleting a user, by an admin, by themselves or with `protobase users delete`, does the same for each of their connected accounts before the user goes; when it cannot, as while the workflows have not started, the user and their accounts stay, and deleting them again finishes the job. <gap>A user deletion refused while the workflows start cannot answer in the language the request asks for because passing the request to the user-deletion listeners is not implemented.</gap> Its refusals come in the language the request asks for. <gap>Connection refusals from the auth endpoints cannot follow the app's `locale` setting because passing it to the auth instance, which is made before the app's options, is not implemented.</gap> The auth endpoint `/unlink-account` refuses an account that Connections lists (`403`, `CONNECTION_UNLINK_REFUSED`): disconnect it there. Connecting again makes a new account with a new id: bind it in the workflow's `connections` and turn the workflow on again. Revoking at Google ends everything the account allowed the app, the sign-in and a linked mailbox included, and the dialog says so.

A workflow names the account each of its connections uses in its definition's `connections`, by `<plugin>:<connection>` and the account's id, which the Connections section shows, as does `list_connections` [over MCP](/reference/mcp/#workflows):

```json
{ "trigger": { "gmail:new_mail": {} }, "connections": { "gmail:google": "<account id>" }, "stateMachine": { ... } }
```

- **Saving:** anyone who may change the workflow saves it, an MCP client included. A save refuses a binding that no trigger or step of the workflow uses.
- **Turning it on is the consent.** A workflow that uses a connection is turned on only by the owner of every account it names, signed in as themselves. Someone else, staff signed in as the owner, and an outside app acting for them get a `403` problem (`own-sign-in-only`), the same for an account that is not there. Over MCP, `enable_workflow` answers that the owner turns it on in the admin app. A save that keeps such a workflow on is turned on again by the person saving it, so only the owner saves it while it is on; anyone else turns it off first.
- **At run time:** each time a step or trigger asks for a token, the app checks again. The version it runs must name the account, the person who turned that version on must own it, and that person must still be allowed to change the workflow in its tenant. Otherwise the token request throws a `not_connected` `ConnectionError`, and the step fails with `States.TaskFailed`. The same happens once the workflow is turned off, once the account is disconnected, and once that person lost the right to change workflows, even between two requests of one step. A run never records the token.
- **Signing in again:** when the provider refuses a refresh token (`invalid_grant`), the step fails with `link_expired`, and every trigger on that account waits as `needs_sign_in`. The Connections section marks the account. Connecting the same account again, without disconnecting it first, resumes the triggers from where they stopped. A refresh that fails otherwise, as when the provider is down, fails only that try, which a `Retry` or the next poll repeats, and the account stays connected.
- **Turning it off:** turning the workflow off, turning on a version with another trigger, or deleting the workflow ends a webhook trigger's subscription at the provider, also for a trigger type the app no longer saves, as after its connection's client was removed. The stop signs in through the account the subscription was made with, as the person who turned that version on, for that one call only; runs and steps still get `not_connected`. While that account is disconnected or no longer that person's, or when the provider refuses its sign-in, the trigger stays `stopping` in `workflow_triggers` with `not_connected`, as does one turned on before the app recorded who turned it on.

A workflow uses one person's accounts: one whose connections name accounts of two people can never be turned on.

## Step types

The built-in step types are the `app` plugin's, written on the same [plugin interface](/reference/workflow-plugins/) as any other; a plugin's step is a Task with `"Resource": "<plugin>:<key>"`. A step's `Arguments` are checked against its type's input schema before it runs: one that does not fit fails as `<Prefix>.InvalidArguments`, such as `Http.InvalidArguments`.

A step's call either changes the world, such as mail sent, a record written or a `POST`, or only reads, such as a `GET`, a record read or a list, as its type declares. A call that changes the world is **recorded**: its checkpoint is saved before the run goes on, with its result and the time it was fetched, so a run taken up again does not make it again. A call a crash cut off before its checkpoint was saved can happen again, as [How a run is run](#how-a-run-is-run) says. A read is done again when a crash comes before the next checkpoint.

### app:http

One request to a URL built at run time:

| Argument | |
| --- | --- |
| `url` | An http or https URL. |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH` or `DELETE`. |
| `headers`, `query` | Objects of text values; `query` is added to the URL's query. |
| `body` | Text is sent as it is, a file value as its bytes with its type, any other value as JSON; a `GET` sends none. |
| `response` | How the answer's body is read: `json` (default, parsed; empty is `null`), `text`, or `file`, kept as a file of the run. |
| `store` | `{ configuration, path? }`: streams the answer's body, of any size, into a [storage configuration](#storing-files), and gives the stored file as `body`. Takes no `response`. |

A `GET` only reads; every other method is recorded. The result is `{ status, headers, body }`, without the cookies the answer sets. A status outside 2xx fails the step with `Http.Status`, whose cause names the status and holds at most the first 200 characters of the body, secrets blanked out first; a redirect is never followed. `Http.Network` is a request that got no answer. The step resolves the URL's host when it runs and refuses it with `Http.AddressRefused` unless every address is public, then connects to the very address it checked, so a URL built from a webhook's payload cannot reach the app's own network. It reads at most 10 MiB of the answer's body: a larger one fails the step with `Http.ResponseTooLarge`, rather than being cut short. With `store`, the body streams straight into the store, so its size is limited only by what the store takes, and the step is recorded, a `GET` too: a run taken up again keeps the stored file and does not fetch it again, from a link that may have expired by then.

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

### Storing files

:::caution[Beta]
Changing a configuration does not move the files already in it, a run is not kept on the server that holds its local files, and an S3 configuration's keys are set through the API or MCP, not yet in the admin app's form.
:::

A value a run keeps is at most 256 KiB, so larger files, such as a 150 MB download, go to storage. A workflow names a **storage configuration**, such as `archive`, rather than where the file lives: a folder on the server, a file share mounted on it, or an S3-compatible bucket. Changing where a configuration points, from a bucket to a local folder say, changes the configuration alone; the workflows that name it stay as they are.

Turn them on with `storage` in `workflows`:

```ts
export default defineConfig({
  workflows: { storage: { root: './data/workflow-storage', endpoints: ['https://storage.example.com'] } },
})
```

Their table, `workflows.storage_configurations`, comes with the next [`protobase migration`](/reference/cli/#migration) after you turn them on, so an app that turns storage on later writes a migration then.

A configuration is a record of `storage_configurations`, which you create and change on its standard pages, linked from each workflow's page, through the API or over MCP:

| Field | |
| --- | --- |
| `name` | What workflows name it by: a lowercase letter, then lowercase letters, digits and `_`. Unique in the tenant. |
| `kind` | `local`, a folder under `root`, or `s3`, a bucket. |
| `dir` | For `local`: a folder inside `root`, such as `invoices/2026`. A path that would leave it, through `..` or a symlink, is refused. Without `root`, only `s3` configurations are taken. |
| `bucket`, `region` | For `s3`: the bucket and its region, both required. |
| `endpoint` | For `s3`, required: one of the `endpoints` the app lists. Its host must resolve to public addresses, which every step checks again. |
| `access_key_id`, `secret_access_key` | For `s3`: the bucket's keys, both required before a step can use it. They are stored encrypted, and nobody can read them again once saved, not even you; set new ones to change them. |

You set the keys with the API or the MCP `update_record` tool: `PATCH /api/v1/storage_configurations/<id>` with its `If-Match` and `{ "access_key_id": "...", "secret_access_key": "..." }`. <gap>An S3 configuration's keys cannot be set in the admin app's form because its editor for write-only fields is not implemented.</gap>

Steps store and read files with:

| Step type | Arguments | Result |
| --- | --- | --- |
| `app:storage.put` | `configuration`, `file`: a file of the run or a stored file, optional `path` | the stored file |
| `app:storage.get` | `file`: a stored file | a file of the run, up to 10 MiB, for steps that take one, such as mail attachments |
| `app:http` with `store` | `store: { configuration, path? }` | `{ status, headers, body }`, `body` the stored file |

A stored file is `{ configuration, node, path, name, type, size }`: the configuration, the server that holds it for a local one, and its path there, never a folder, bucket or key. A `path` is relative: letters, digits, `.`, `_` and `-` in segments split by `/`, none starting with `.`; any other fails the step with `Storage.InvalidArguments` before anything is stored. Without a `path`, a step stores under a path of its own in its run, the same each time the step is tried, so a step a crash made run again replaces its file rather than leaving a second one. A put is recorded; a get only reads.

```json
{
  "Fetch": { "Type": "Task", "Resource": "app:http", "Arguments": { "url": "{% $states.context.Execution.Input.link %}", "store": { "configuration": "archive" } }, "Assign": { "report": "{% $states.result.body %}" }, "Next": "Read" },
  "Read": {
    "Type": "Task", "Resource": "app:storage.get", "Arguments": { "file": "{% $report %}" },
    "Catch": [{ "ErrorEquals": ["Storage.NotFound"], "Next": "Gone" }],
    "Next": "Mail"
  }
}
```

A step reads the configuration it names afresh each time, as the user who saved the run's version, with the roles they hold now. `app:http` with `store` checks the configuration and path before it sends the request, so one it cannot store to fails without a request. It fails with:

| Error | |
| --- | --- |
| `Storage.NotFound` | No configuration of that name the workflow's last editor may read, which says nothing of one in another tenant or one they may not read; or the file is gone, which a `Catch` can take. |
| `Storage.Unavailable` | The configuration cannot be used as it is, such as an S3 one without keys, with keys that no longer decrypt, or on a server whose environment sets an S3 endpoint, region or session token. |
| `Storage.Failed` | The store failed; the cause names its error code only. |
| `Storage.Full` | The store has no room left. |
| `Storage.TooLarge` | `app:storage.get` of a file over 10 MiB. |

A stored file is read from where its configuration points now. <gap>Changing a configuration cannot move the files already in it because moving stored files is not implemented.</gap> A local configuration's files are on one server. <gap>A run cannot be kept on the server that holds its local files because routing runs to a server is not implemented.</gap>

## Runs and their steps

A run starts when it is created, through the API or the admin app, in the same transaction: `POST /api/v1/workflow_runs` with `{ "workflow_id": "...", "input": { ... } }`. The input is at most 256 KiB as JSON and nests at most 64 levels; a larger one is refused with `input-too-large` or `input-too-deep` and no run. From the app's own code, such as a job or a write hook, `startWorkflow(db, { workflow, input, tenant, startedBy, trace })` from `@protobase/server` starts one in `db`'s transaction, so it starts when the caller's writes commit, or not at all. With a `key`, such as `orders:42`, a workflow runs once per key: a start with a key it has a run for already, in this transaction or another, starts nothing and returns that run's id.

A run's status is `queued`, `running`, `waiting` (with the time it goes on), `succeeded` with its output, or `failed` with its error and cause.

### Traces

:::caution[Beta]
A trace that cannot be written is not kept, and a step a crash made run again is in the trace once for each time it ran.
:::

A run's **trace** keeps every step it took, one JSON object a line (JSONL): the state, its type, the scope it ran in (empty for the run itself, `Each.3[0]` for item 0 of the Map `Each` that was step 3), its number, its try, its status (`succeeded`, `retrying`, `caught` or `failed`), its input, output and assigned variables, its logs, when it started and ended, its error and cause, where it goes on to, and whether it was `recorded`. It is kept in the private file provider, not the database: a segment writes the steps it ran as a part under `workflows/<run>/trace/`, numbered in the order the run wrote them by a count kept at `workflows/<run>/trace-next`, before each checkpoint after them is saved, so a crash once it is saved loses none of them, and its last steps before the run goes on, so the next segment's part comes after them; the segment that ends the run joins the parts into `workflows/<run>/trace.jsonl` before the run is marked ended, so a run seen ended has its whole trace, which the run's **Trace** field (`trace_file`) then offers to download, and the run's page lists step by step. A step a crash made run again is in the trace once for each time a part kept it. A trace that cannot be written goes to the app's error report (`onUnhandledError`), and the run goes on.

Every run keeps a trace by default. The run's own `trace` (set as it is started), else its workflow definition's `trace`, else the config's `workflows.trace` says which: `all`, `failed`, which keeps the trace of a run that fails and drops the parts of one that succeeds, or `none`.

### Secrets

A workflow reads a secret only by name, `$states.context.Secrets.TICKETS_TOKEN`, and only one the config's `workflows.secrets` lists; the values are never part of the definition. Every value of the listed secrets is blanked out as `[redacted]` wherever it appears in what a run records: a step's input, output, variables, logs, error and cause, and the run's output, error and cause, in the database and in the trace alike. In a Task's input, every field whose name says it holds a secret, such as `Authorization`, `token` or `apiKey`, is blanked out too. A value an expression computes from a secret, however it changes it, such as `'Basic ' & $base64encode(...)`, is kept whole as `[redacted]`: in a Task's `Arguments` the step type gets the value and the record keeps `[redacted]`; in an `Output`, an `Assign`, a Map's `Items` or a Fail's `Error` and `Cause` the value itself is `[redacted]`, so later states read that. Read a secret in the `Arguments` of the Task that sends it. A secret that comes back changed in a step's result, such as one a server encodes in its answer, is not the value the runner looks for, and is kept as it came. A run's input is kept as its caller gave it, so a secret's value never belongs in it.

### Following and debugging a run

*Runs* on a workflow's page in the admin app lists its latest 20 runs, newest first, with their status, who or what started them, when, how long they took, their version and input; the Runs table on the workflow's form lists them all, with their error. Choosing one shows it on the workflow's page, on the version it ran on, with a mark on each state. A run's own address opens it on the latest version, as [The workflow's page](#the-workflows-page) says, where *Show on version* shows the version it ran on:

| Mark | |
| --- | --- |
| Succeeded, Caught, Failed | How the state's last step ended; for a state inside a Map, the worst of its items. A failed state's box is red. |
| Retrying | Its last try failed and a retrier tries it again. |
| Running | The run is on it, or goes on to it next. |

A state that took more than one step, by its tries, its visits or a Map's items, says how many. Choosing a state lists its steps in the side panel in the order they ran, 20 at a time with *Show more*: each with its try, the Map item it ran in, its status, when it started and how long it took, its error and cause, input, output, the variables it assigned and its logs. Choosing the trigger shows the run's input, and with nothing chosen the side panel shows the run itself: its status, when it started and ended, who started it, its error, input and output. A chosen state's panel offers *Re-run from this step*, and the run's panel *Replay without writing*. *Open the run's own page* leads to the run's record page, `/workflow_runs/<id>?standard=true`, with its re-runs listed, drawn with the `workflow_run` [field type](/reference/plugins/#workflow) on the run's `id`. The page opens on the state that failed, the innermost one when a Map's item failed, so a failed run shows its error and logs at once.

The page reads the steps from the run's [trace](#traces), at `/api/workflows/runs/<id>/trace`, for a person who may read the run and its `trace_file`. While a run is queued, running or waiting, the page reads the run again every second, and its trace's steps after those it has, or the whole trace again when those are no longer its first steps, so the marks, the step lists and the run's fields change as it goes, without a reload; it stops once the run has ended. A run that kept no trace says so. Everything the page shows is what the run recorded, so a [secret](#secrets) shows as `[redacted]` wherever it would have been.

### Run status

:::caution[Beta]
Who marked a workflow resolved shows by name only in an app with organizations.
:::

Each workflow has a status from its last 10 ended runs, so you see which ones need attention without opening them. Runs that are queued, running or waiting do not count. A failed run counts until someone marks the workflow as resolved after it ended, until a new version is saved, as a failure on an older version than the workflow's latest no longer counts, or until it is no longer among the last 10 ended runs, such as after ten later successful runs.

| Status | Mark | When |
| --- | --- | --- |
| Last run failed | red square | The latest ended run failed and still counts. |
| Earlier failure unresolved | orange triangle | The latest ended run succeeded, and an earlier one of the 10 failed and still counts. |
| No unresolved failures | green dot | The latest ended run succeeded, and no failure among the 10 still counts. |
| No runs yet, No runs since resolved, No runs since this version | gray ring | There is no ended run, or the latest is a failure that no longer counts. |

- **In the sidebar.** Workflows lists up to 20 workflows by name under it, each with its mark, and the status in its name for screen readers and in its tooltip, then *View all*. It refreshes as the sidebar's [recent records](/reference/sidebar/#recent-records) do, and when a run you follow on a workflow's page ends. *View all* opens the list of every workflow, which shows each one's mark and status in a column of its own.
- **On the workflow's page.** *Status* says the reason in words with a link that opens the run on the graph, such as *Last run failed, 7 Nov 2026, 14:32* or *1 unresolved failure in the last 10 runs, latest 3 Nov 2026, 09:10*; a gray status says it without a link.
- **Mark as resolved.** While the status is red or orange, *Mark as resolved* beside it clears every failure so far, and the page then says who marked it and when. Anyone who may change the workflow may use it; through the API it is `POST /api/v1/workflow_resolutions` with `{ "workflow_id": "..." }`, each mark kept as a `workflow_resolutions` record, which `workflow_resolutions.read` reads. <gap>A mark as resolved cannot be undone because removing a resolution is not implemented.</gap>
- **Who sees it.** The status fields of a workflow, `run_status`, `status_run_id`, `status_run_at` and `unresolved_failures`, are real columns that the database keeps as runs end, so they cost nothing to read; only a caller whose roles hold `workflow_runs.read` on every run reads them. Anyone else sees the workflows listed without marks and no status. <gap>Who marked a workflow resolved shows as a user id in an app without organizations because naming users to every reader is not implemented.</gap>

### Re-running a failed run

:::caution[Beta]
A re-run from a step needs the earlier run's trace, and a re-run from the failed step keeps in its trace only the steps it ran, so it cannot itself be re-run from a state before them.
:::

A failed run keeps its [checkpoints](#how-a-run-is-run). `POST /api/v1/workflow_runs` with `{ "workflow_id": "...", "rerun_of": "..." }` starts a run that:

- runs on the workflow's version now, so fix the step first, and on the earlier run's input: a re-run given an `input` of its own is refused with `rerun-input`;
- goes on from the earlier run's checkpoints, as a run goes on after a crash: each scope from its last checkpoint, the state it stood at from its first try, at the re-run's own time. No recorded call before it, such as a mail sent or a record written, happens again; the reads and computing steps since run again. A Map that runs again keeps its finished items and runs again only those that had not finished, each from where it stood;
- is refused, and nothing starts, when the earlier run is not one of the workflow's runs the person may read with its trace (404), did not fail (`run-not-failed`), or would go on at a state or in a Map the version no longer has (`rerun-refused`, naming it).

With `rerun_from`, the name of a state of the workflow itself, it re-runs any run that ended, succeeded or failed, from that state: the steps before its first visit stay as they ran, and it and all after it run again, so what they send goes out again. It takes the steps before that state from the earlier run's [trace](#traces), so it needs a run that kept one: a run whose trace is `all`, or `failed` for a run that failed. The re-run goes on from a checkpoint at that state with the variables those steps assigned and the output of the last one, at the re-run's own time, and its own trace starts with those steps, so a re-run of it can start from any earlier state too. A kept step that succeeded, whose state now has a variable that keeps its whole result, `"Assign": { "customer": "{% $states.result %}" }`, gets that variable from what it gave, unless that state shaped its result with `Output` in the version the earlier run ran. A kept step that failed into a catcher keeps what it assigned then. `POST /api/v1/workflow_runs` with `{ "workflow_id": "...", "rerun_of": "...", "rerun_from": "Store" }` does it, and a workflow's page does it from a step with *Re-run from this step*. It is refused when the run has not ended (`run-not-ended`), kept no trace (`rerun-no-trace`), never reached that state, or the version no longer has it or no longer starts there, or its trace lacks a step before it, as the trace of a re-run from the failed step does (`rerun-refused`), and without `rerun_of` (`rerun-from-without-run`).

A workflow may be created with no steps: its `definition` then defaults to one with `manual` as its trigger and no states. A save of a definition with no states checks the rest of it as any save does; such a version is kept, and refused as it is published or run.

A re-run from the failed step's trace holds only the steps it ran itself; the earlier run's own page lists its re-runs.

### Replaying a run

:::caution[Beta]
A replay holds back only the steps whose type declares that it writes, and a held-back step whose state shaped its result with `Output` in the replayed run gets no result.
:::

A run that ended, succeeded or failed, offers *Replay without writing* where it is shown. That, or `POST /api/v1/workflow_runs` with `{ "workflow_id": "...", "rerun_of": "...", "replay": true }`, starts a run from the start on the workflow as it is now and on the replayed run's input, acting as the same people as any run started now. A developer whose workflow sent a mail with the wrong contents fixes the steps that formed it, saves, and replays the run, again until the mail is right, without sending it:

- a step whose type writes, such as `app:mail.send`, `app:records.create`, `app:records.update`, an `app:http` request with any method but `GET`, and a plugin's step that does not say it only reads, is not called, and its logs say *Not sent: replay*. It takes the result of the replayed run's step of the same state, in the same Map item, and the same visit of that state, as that run's [trace](#traces) keeps them, so states added or removed elsewhere do not change what it gets; its `Output`, `Assign` and `Next` then apply as the workflow has them now. A step whose visit failed fails with the same error and cause, which only a `Catch` takes, since every retry would give that error again. One the replayed run has no such step for, whose state there was no Task or shaped its result with `Output`, or whose run kept no trace, gives a `null` output and goes on to its next state. <gap>A replay cannot give a held-back step the result of a state that shaped it with `Output` because traces do not record a Task's result before its `Output`.</gap>;
- a step that only reads, such as `app:records.get`, `app:records.list`, an `app:http` `GET`, or a plugin's step that says so, is served from the [step cache](/reference/workflow-plugins/#caching-results) when its type caches and an earlier result matches, saying so in its logs, with a line for each secret that changed since that result was kept; otherwise it runs again, as the same people a run of that version acts as;
- Pass, Choice, Map, Succeed and Fail states compute as always, so a fixed composition shows in the held-back step's input, and a Wait goes on at once.

A replay given an `input` of its own is refused with `rerun-input`, and one without `rerun_of` with `replay-without-run`. It is refused, and nothing starts, when the replayed run is not one of the workflow's runs in the person's tenant (409, as for a workflow that is not there), has not ended (`run-not-ended`), or when the person may not start runs of the workflow, or read the run and its `trace_file` (404). A step holds back only as its type declares: a plugin's step that writes while it declares it only reads runs in a replay too, so a replay is no guard against a plugin that declares it wrongly.

### Test runs

A workflow's page offers *Test run* in its panel: a sample input as JSON, which every state reads as `$states.context.Execution.Input`, filled in from the last run, with the latest runs' inputs to start from, and what the run will do, naming the steps that act. *Start run* shows the run on the graph, followed as it runs. With unsaved changes it saves them first, as a save changes nothing that is live, and the button says so. A test run is a run like any other, of the version saved last, which need not be published: its steps do what they do, acting as that version's saver.

## Over MCP

An AI client signed in to the app's [MCP endpoint](/reference/mcp/#workflows) finds, makes, changes and test-runs workflows as the person: it lists the step types and triggers with their arguments, reads and validates definitions, saves one whole or by a small edit, starts a run with an input, reads each step of the run's trace with its input, output, logs and error, and re-runs a failed run from its last checkpoint once the workflow is fixed, turns a workflow's trigger on and off, and issues a webhook trigger's URL. The endpoint's instructions describe this language, and a refused definition comes back with its problems, each naming the state and field.

## Who may do what

The workflow resources take only [named grants](/reference/access/#resources-that-need-named-grants): a role's wildcard such as `*.read` reaches none of them, since a run reads and sends data as its definition says.

| Grant | |
| --- | --- |
| `workflows.create`, `workflows.update`, `workflows.delete` | Make, change and delete workflows, and turn them on and off. Each save that changes the definition makes the saver the workflow's last editor, whom its records steps and its trigger act as. |
| `workflow_runs.create` | Run a workflow, with any input. The API writes only the fields a caller reads, so it goes with `workflow_runs.read`, and the caller must read the workflow too. |
| `workflows.read`, `workflow_versions.read`, `workflow_runs.read`, `workflow_triggers.read` | Read workflows, their versions, runs and triggers, the runs' traces with every step's input and output included. |
| `workflow_resolutions.read` | Read who marked which workflow resolved and when. Marking one needs no grant of its own: whoever may change the workflow may. |
| `storage_configurations.read` | Let workflows you save use the [storage configurations](#storing-files), and see them. Their keys are never shown. |
| `storage_configurations.create`, `storage_configurations.update`, `storage_configurations.delete` | Make, change and delete storage configurations. |

```ts
defineRoles({
  admin: ['*'],
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*'],
})
```

All of them are scoped to the tenant like any resource with `.tenant()`. A run takes its workflow's tenant; a start of another tenant's workflow is refused as one of a workflow that is not there.

## How a run is run

:::caution[Beta]
A write cut off by a crash before its checkpoint is saved happens again, unless its receiver dedupes by the step's idempotency key, and a value a run keeps is at most 256 KiB.
:::

The runner is `@protobase/workflows`, a package with no other Protobase dependency, over a narrow port: where runs and their checkpoints are kept (here the `workflows` schema), the queue that runs them (here the app's [jobs](/reference/jobs/)), the step types, and where traces go (here the private file provider).

- A run is run in **segments**, each a `workflows.segment` job whose payload is the run's id alone: one runs the run from where it stands to its next wait, then queues the next. A Wait whose time is still ahead, or a retry's delay, saves a checkpoint with the time the run goes on, ends the segment and queues the next one for that time, so a waiting run holds no worker. A segment hands the rest of the run on after a minute of steps.
- The database keeps only what a run needs to go on: per scope (the run, or a Map item) its latest **checkpoint**, where it stands: the state it goes on to with that state's input, its variables, the try of a state being retried, and its clock. A checkpoint is saved after a recorded step (a call that changes the world, whose small result it keeps with the time it was fetched, never its input), after a Wait or a retry's delay, and for every scope that moved as the segment pauses; a step that only computes or reads saves nothing. A run that succeeds drops its checkpoints, and a run of only such steps that ends in its segment writes none; a run that fails keeps them for a [re-run](#re-running-a-failed-run).
- Each save is **one statement**, which replaces a scope's checkpoint only when that is the one the segment took the scope up from, so a second segment of the same run that fell behind stops.
- A worker that stops or dies mid-step leaves that step unsaved: its job is tried again and takes each scope up from its last checkpoint, so a recorded call whose checkpoint was saved never happens again, and the steps since run **at least once**: computing steps give the same values, as their clock and random numbers are the checkpoint's, and reads are done again. A value read before a Wait carries over it in the variables; read after the Wait for fresh data. A call whose effect happened before its checkpoint was saved, such as a request that was sent, happens again. Every try of a step, and every time a run taken up again reaches it, gets the same idempotency key, for a step type whose receiver dedupes by it, and `app:mail.send` makes it the mail's Message-ID. `app:records.create` keeps it with the records it creates, in their transaction, so a try after they committed creates none again and returns them as the first try created them. A job whose worker died is tried again once its timeout, 10 minutes, has passed.
- A Map's items run in the segment that reaches them, each under its own scope; an item that waits ends the segment once the others running settle, the items that ended are saved as ended, and the next segment takes each item up where it stands. A Map's `Items` is evaluated again by a segment that takes up an unfinished Map.
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
| The input, output and variables of a step, and a Map's items' outputs together | 256 KiB each, as JSON; beyond, the step fails with `States.DataLimitExceeded`, whose cause gives the size. Keep large data in a store and pass a reference. |
| A step's logs | 100 lines of 1,000 characters; more lines are left out with a last line saying how many. |
| Blocks | 4 nested in one another at most; 1,000 runs of blocks started by one run. |
| A run's input | 256 KiB as JSON, 64 levels deep. |
| An answer `app:http` reads, a file a run keeps | 10 MiB. |
| A Wait | 366 days, by `Seconds` or `Timestamp`. |
