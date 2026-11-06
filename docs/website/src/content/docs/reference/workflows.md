---
title: Workflows
description: Workflows written as state machines in the States Language with JSONata, checked on every save, run step by step on the app's jobs, with every step recorded.
---

:::caution[Beta]
Workflows run when they are started through the API, over MCP, from the app's code or by a test run in the admin app, and from record triggers. They also run from webhook and polling triggers, within the limits named at the start of their sections. Connections that sign in to other services are not built.
:::

A **workflow** is a graph of steps that the server runs one after another along its edges: fetch something, decide, run a step per item, merge the results, write records, send mail. It is written in the **States Language**, the JSON language of state machines, with **JSONata** as its expression language, in a profile of it that reads every value by name. A language model writes and changes it as easily as a person, and the same document is what the server checks and runs. Each run records every step it takes, with what the step read, gave and logged.

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
| `workflow_runs` | A run, started by creating it with `workflow_id` and an `input`, or with `rerun_of` to [re-run a failed run](#re-running-a-failed-run); it runs the version its workflow had then. Its status, output, error and timing are written by the runner. |
| `workflow_steps` | Every step of every run. Read-only. |
| `workflow_triggers` | The trigger of each enabled workflow that has one besides `manual`: its type, status and last error. Read-only. |

| `workflows` | |
| --- | --- |
| `schema` | The schema of its tables, for a database that has a `workflows` schema already. Default `workflows`. |
| `secrets` | The environment variables workflows may read, by name. Startup stops when one is unset or shorter than 8 characters. |
| `allowPrivateAddresses` | Lets the `app:http` step, and every plugin's `fetch`, reach private, loopback and link-local addresses, for development and tests. Default false. |
| `plugins` | Packages of [workflow plugins](/reference/workflow-plugins/) to run, by name, beside the app's own in `workflows/plugins/<name>.ts`. |

Records steps act as each workflow's last editor, with the roles the project's sign-in gives them now. A project that signs people in otherwise exports its own, `async ({ id, tenant }) => [...]`, as the default of `workflows/saved-by-roles.ts` (`createAdmin` takes it as `workflows.savedByRoles`); without either, startup stops.

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

A trigger starts runs only while its workflow is enabled: set `enabled_version` to the workflow's current `version` through the API, in the admin app or with `enable_workflow` over MCP, and clear it to turn the workflow off. The trigger is registered at once on every server process, with no restart, and its status, `active` or `failing` with its last error, is the workflow's `workflow_triggers` record. A save of an enabled workflow keeps it enabled on its new version; a new version whose trigger has the same type and input keeps the running trigger as it is, and any other change stops it and starts the new one. A trigger's runs run the enabled version and act as the user who saved it, as any run acts as its version's saver.

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

The run's input is `{ method, query, headers, body, received_at }`: `body` is the JSON, the form fields (a field sent more than once as the list of its values) or the text sent, and a body that makes the input over 1 MiB as JSON, as escaping can before the body itself is, is a [file of the run](#file-values), which needs the app's `private` file provider. `headers` leaves out `authorization`, `cookie`, every `webhook-*` header, the `hmac` signature header and `x-forwarded-*`, and the input never holds the URL, so no credential reaches a run, its steps or its logs. A `standard_webhooks` call starts one run per `webhook-id`, and an `hmac` or `bearer` call one per value of the `idempotency_header` you name, when it sends one; the id is at most 200 characters.

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
| `Task` | Runs a step type, its `Resource`, with its `Arguments`; `TimeoutSeconds`, `Retry` and `Catch`. |
| `Pass` | Shapes values with `Output` and `Assign`, and goes on. |
| `Choice` | Goes to the `Next` of the first of its `Choices` whose `Condition` is true, else to its `Default`; with neither it fails with `States.NoChoiceMatched`. A rule may carry its own `Output` and `Assign`. |
| `Wait` | Waits `Seconds`, or until a `Timestamp` (ISO 8601), as a number or an expression. |
| `Map` | Runs its `ItemProcessor` once per item of `Items`, at most `MaxConcurrency` at once (0, the default, means the most, 20); its result is the items' outputs in order. |
| `Succeed` | Ends the run, or the Map item, with its `Output`. |
| `Fail` | Ends it as failed with its `Error` and `Cause`. |

A state's output is its `Output`, else its result (a Task or Map) or the input it was given. Fields that read a state's input implicitly (`InputPath`, `Parameters`, `ResultPath` and the other fields of the JSONPath language), and `Parallel`, are not part of the profile.

### Errors and retries

A failing Task or Map fails with an error name: a step type's own, such as `Http.Status`, `States.Timeout` when it ran past its timeout, `States.TaskFailed` for any other error it threw, and `States.QueryEvaluationError` for an expression that did not evaluate or ran past its limits. The first retrier whose `ErrorEquals` names it tries the state again after `IntervalSeconds` (default 1), times `BackoffRate` (default 2) for each earlier retry, up to `MaxDelaySeconds`; `MaxAttempts` counts the retries after the first try (default 3, 0 for none). Without `Retry` a failure is not retried. Once no retry is left, the first catcher that names it goes on to its `Next`; without one the run fails. `States.ALL` names every error but `States.DataLimitExceeded` and `States.Runtime`, which end the run even where a retrier or catcher names them.

## The editor

A workflow's record page in the admin app, `/workflows/<id>`, and its create form draw the definition as a graph to edit, and save the same document the API saves:

- **The graph lays itself out.** The trigger is on top, each state is a box, a Map is a box around the states it runs for each item, and each edge is drawn from the field that names it: a state's `Next`, a Choice's rules (labelled with their condition) and its `Default` ("Otherwise"), and a Task's or Map's catchers ("On error", dashed). The graph is laid out by ELK's layered algorithm, from top to bottom, each time a state or edge is added, removed or renamed; the document keeps no positions, so the graph a person sees is the one a model or the API wrote, and the one they edit is what a model reads back. The page scrolls under the wheel; the canvas zooms with its buttons and by pinching.
- **Adding a step.** *Add a step* adds a Task of any step type the app can run, its plugins' included, or a Choice, Map, Wait, Pass, Succeed or Fail, named `Step 1`, `Step 2` and so on. It goes into the Map chosen, or the Map the chosen step is in, else into the workflow; it ends the run, or its item, until it is connected, and in a workflow or Map without steps it is the first.
- **Connecting steps.** Drag from a step's handle to another step, or tap one handle and then the other: the bottom handle sets `Next`, a Choice's *When* handle adds a rule and its *Otherwise* handle sets `Default`, a Task's or Map's *On error* handle adds a catcher of `States.ALL`, and the trigger's handle sets `StartAt`. A step leads only to steps of its own machine, so an edge into or out of a Map is refused. The chosen step's form sets the same edges with menus: *Goes on to*, each rule's and catcher's *Then goes to*, and *Otherwise goes to*.
- **Removing.** Delete or Backspace removes the chosen step or edge, as does the form's *Remove step*. Removing a step removes the edges to it: a `Next` to it becomes `End`, and a rule, `Default` or catcher naming it goes. Removing the first step of a workflow or Map makes the first step left in it the first.
- **A step's form.** Choosing a step opens its form under the graph: its name, which renames every edge to it, then what its type takes. A Task's form has a field for each argument of its step type's input schema, the ones it needs marked, as listed under [Step types](#step-types) or by its plugin: one line of text for a string, one line for a number or `true` and `false`, a menu for an `enum`, names separated by commas for a list of strings, and JSON for anything else; a Choice's its rules and `Default`; a Map's `Items` and `MaxConcurrency`; a Wait's `Seconds`; a Pass's and a Succeed's `Output`; a Fail's `Error` and `Cause`. A field takes text, an expression (`{% ... %}`) or JSON; an emptied field is left out. *The step as JSON* edits every field of the step, such as `Retry`, `Assign` and `TimeoutSeconds`. The trigger's form picks among the app's triggers, its plugins' included, and draws a field for each input of its schema the same way, such as a record trigger's resource, `when` and `key`.
- **Problems on their step.** The editor runs the same check as a save on every change, and shows each problem on the step it names, as a count on its box and a list and a marked field in its form; a problem with the trigger or the first step shows on the trigger, and one about the whole document above the graph. Saving writes the definition through the API, where the save hook checks it again: a definition with a problem is refused with the 400 above, whose `errors` hold each problem for the `definition` field, with its state and field in `params`.

A save also refuses a Task that leaves out an argument its step type needs, such as `app:http` without `url`, unless its `Arguments` is one expression, whose value is known only when it runs. A user who may read a workflow but not change it sees the same graph and forms, locked. <gap>The editor cannot undo a single change because an undo history is not implemented.</gap> The editor reads the app's types from `GET /api/workflows/types`, `client.workflowTypes()` of `@protobase/client`: the same list `list_workflow_types` gives over MCP, `{ step_types, triggers }`, which only a user who may read workflows gets. A type the app cannot run, such as one that signs in through a connection whose OAuth client the app does not set, is not offered, and the check refuses it with the reason; a stored trigger of such a type, or of a type the app does not have, shows its type and input, read-only. <gap>A box on the graph cannot name a plugin's trigger or step type by its label because handing the type list to the canvas is not implemented; it shows the type's id, such as `acme:shout`.</gap>

## Connecting an account

:::caution[Beta]
Each connected account belongs to the person who connected it, and only that person can turn on a workflow that uses it.
:::

A trigger or step type that signs in to another service, such as a mailbox, uses an account that someone connected. Each person connects their own accounts on the **Connections** section of the account page's Profile tab. Connecting takes them to the provider and back. The app keeps the account's tokens on the server, encrypted, and refreshes them when they expire. **Disconnect** always deletes the token, so no step or trigger can use it again. When the connection has a revocation endpoint, it first asks the provider to revoke the token. A provider that does not answer or refuses keeps the token valid on its side, and the answer's `revoked` is false. A trigger that uses the account stops as `needs_sign_in`. Connecting again makes a new account with a new id: bind it in the workflow's `connections` and turn the workflow on again. Revoking at Google ends everything the account allowed the app, the sign-in and a linked mailbox included, and the dialog says so.

A workflow names the account each of its connections uses in its definition's `connections`, by `<plugin>:<connection>` and the account's id, which the Connections section shows:

```json
{ "trigger": { "gmail:new_mail": {} }, "connections": { "gmail:google": "<account id>" }, "stateMachine": { ... } }
```

- **Saving:** anyone who may change the workflow saves it, an MCP client included. A save refuses a binding that no trigger or step of the workflow uses.
- **Turning it on is the consent.** A workflow that uses a connection is turned on only by the owner of every account it names, signed in as themselves. Someone else, staff signed in as the owner, and an outside app acting for them get a `403` problem (`own-sign-in-only`), the same for an account that is not there. Over MCP, `enable_workflow` answers that the owner turns it on in the admin app. A save that keeps such a workflow on is turned on again by the person saving it, so only the owner saves it while it is on; anyone else turns it off first.
- **At run time:** each time a step or trigger asks for a token, the app checks again. The version it runs must name the account, the person who turned that version on must own it, and that person must still be allowed to change the workflow in its tenant. Otherwise the step fails with `not_connected`. The same happens once the workflow is turned off, once the account is disconnected, and once that person lost the right to change workflows, even between two requests of one step. A run never records the token.
- **Signing in again:** when the provider refuses a refresh token (`invalid_grant`), the step fails with `link_expired`, and every trigger on that account waits as `needs_sign_in`. The Connections section marks the account. Connecting the same account again, without disconnecting it first, resumes the triggers from where they stopped. A refresh that fails otherwise, as when the provider is down, fails only that try, which a `Retry` or the next poll repeats, and the account stays connected.

A workflow uses one person's accounts: one whose connections name accounts of two people can never be turned on.

<gap>Turning off a workflow whose webhook trigger signs in through a connection cannot end its subscription at the provider because the consent ends with the workflow and an unsubscribe that outlives it is not implemented; the trigger stays `stopping` with that error in `workflow_triggers`.</gap>

## Step types

The built-in step types are the `app` plugin's, written on the same [plugin interface](/reference/workflow-plugins/) as any other; a plugin's step is a Task with `"Resource": "<plugin>:<key>"`. A step's `Arguments` are checked against its type's input schema before it runs: one that does not fit fails as `<Prefix>.InvalidArguments`, such as `Http.InvalidArguments`.

### app:http

One request to a URL built at run time:

| Argument | |
| --- | --- |
| `url` | An http or https URL. |
| `method` | `GET` (default), `POST`, `PUT`, `PATCH` or `DELETE`. |
| `headers`, `query` | Objects of text values; `query` is added to the URL's query. |
| `body` | Text is sent as it is, a file value as its bytes with its type, any other value as JSON; a `GET` sends none. |
| `response` | How the answer's body is read: `json` (default, parsed; empty is `null`), `text`, or `file`, kept as a file of the run. |

The result is `{ status, headers, body }`, without the cookies the answer sets. A status outside 2xx fails the step with `Http.Status`, whose cause names the status and holds at most the first 200 characters of the body, secrets blanked out first; a redirect is never followed. `Http.Network` is a request that got no answer. The step resolves the URL's host when it runs and refuses it with `Http.AddressRefused` unless every address is public, then connects to the very address it checked, so a URL built from a webhook's payload cannot reach the app's own network. It reads at most 10 MiB of the answer's body: a larger one fails the step with `Http.ResponseTooLarge`, rather than being cut short.

### app:records

| Step type | Arguments | Result |
| --- | --- | --- |
| `app:records.create` | `resource`, `data`: an object of field values, or a list of them, created in one batch: all or none | the created record, or the list of them |
| `app:records.update` | `resource`, `key`, `data` | the updated record |
| `app:records.get` | `resource`, `key` | the record |
| `app:records.list` | `resource`, optional `filter` (the API's filter syntax), `order_by`, `limit` | `{ records }` |

They go through the app's API as the user who saved the run's version, with the roles that user holds now in the run's tenant, so its access rules, tenant scope, validation and write hooks apply as they do to that user's own requests. Whoever may start a run (`workflow_runs.create`) thus has it do what the workflow's last editor may do; a workflow never does more. When that user holds no role any more, or the version was saved by the app's code, the step fails with `Records.Refused`, as it does for a refusal of the API, its status and message in the cause. A number for a decimal field is written as its text; a file field takes a file value the run keeps.

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

A run starts when it is created, through the API or the admin app, in the same transaction: `POST /api/v1/workflow_runs` with `{ "workflow_id": "...", "input": { ... } }`. The input is at most 1 MiB as JSON and nests at most 64 levels; a larger one is refused with `input-too-large` or `input-too-deep` and no run. From the app's own code, such as a job or a write hook, `startWorkflow(db, { workflow, input, tenant, startedBy })` from `@protobase/server` starts one in `db`'s transaction, so it starts when the caller's writes commit, or not at all. With a `key`, such as `orders:42`, a workflow runs once per key: a start with a key it has a run for already, in this transaction or another, starts nothing and returns that run's id.

Each step is recorded as a `workflow_steps` record: the state, its type, the scope it ran in (empty for the run itself, `Each.3[0]` for item 0 of the Map `Each` that was step 3), its number, its try, its status (`succeeded`, `retrying`, `caught` or `failed`), its input, output and assigned variables, its logs, when it started and ended and how long it took, its error and cause, and where it goes on to. A run's status is `queued`, `running`, `waiting` (with the time it goes on), `succeeded` with its output, or `failed` with its error and cause.

### Secrets

A workflow reads a secret only by name, `$states.context.Secrets.TICKETS_TOKEN`, and only one the config's `workflows.secrets` lists; the values are never part of the definition. Every value of the listed secrets is blanked out as `[redacted]` wherever it appears in what a run records: a step's input, output, variables, logs, error and cause, and the run's output, error and cause. In a Task's recorded input, every field whose name says it holds a secret, such as `Authorization`, `token` or `apiKey`, is blanked out too. A value an expression computes from a secret, however it changes it, such as `'Basic ' & $base64encode(...)`, is kept whole as `[redacted]`: in a Task's `Arguments` the step type gets the value and the record keeps `[redacted]`; in an `Output`, an `Assign`, a Map's `Items` or a Fail's `Error` and `Cause` the value itself is `[redacted]`, so later states read that. Read a secret in the `Arguments` of the Task that sends it. A secret that comes back changed in a step's result, such as one a server encodes in its answer, is not the value the runner looks for, and is kept as it came. A run's input is kept as its caller gave it, so a secret's value never belongs in it.

### Following and debugging a run

A workflow's page in the admin app lists its runs, newest first, with their status, who or what started them, when, how long they took, their version and error. A run's page, `/workflow_runs/<id>`, draws the workflow's graph as the run's version has it, the `workflow_run` [field type](/reference/plugins/#workflow) on the run's `id`, with a mark on each state:

| Mark | |
| --- | --- |
| Succeeded, Caught, Failed | How the state's last step ended; for a state inside a Map, the worst of its items. A failed state's box is red. |
| Retrying | Its last try failed and a retrier tries it again. |
| Running | The run is on it, or goes on to it next. |

A state that took more than one step, by its tries, its visits or a Map's items, says how many. Choosing a state lists its steps under the graph in the order they ran, 20 at a time with *Show more*: each with its try, the Map item it ran in, its status, when it started and how long it took, its error and cause, input, output, the variables it assigned and its logs, and a link to the step's own page. Choosing the trigger shows the run's input. The page opens on the state that failed, the innermost one when a Map's item failed, so a failed run shows its error and logs at once.

While a run is queued, running or waiting, the page reads the run and its steps again every second, through the API as the person, so the marks, the step lists and the run's fields change as it goes, without a reload; it stops once the run has ended. The graph marks the states of a run's first 500 steps; the run's *Steps* list has them all. <gap>The graph cannot mark the steps after a run's first 500 because reading a run's steps in more than one page for the trace is not implemented.</gap> Everything the page shows is what the run recorded, so a [secret](#secrets) shows as `[redacted]` wherever it would have been.

### Re-running a failed run

A failed run's page offers *Re-run from the failed step*. It opens the form for a new run with `workflow_id` and `rerun_of` filled in; creating it, through the form or `POST /api/v1/workflow_runs` with `{ "workflow_id": "...", "rerun_of": "..." }`, starts a run that:

- runs on the workflow's version now, so fix the step first, and on the earlier run's input: a re-run given an `input` of its own is refused with `rerun-input`;
- keeps the earlier run's steps, copied as they were, but the try that failed and that state's retried tries before it, so the failed state runs again from its first try and none of the steps before it runs again. A Map that runs again keeps its finished items and runs again only those that had not finished, each from where it stood;
- is refused, and nothing starts, when the earlier run is not one of the workflow's runs the person may read (404), did not fail (`run-not-failed`), or would go on at a state the version no longer has (`rerun-refused`, naming the state).

A kept step's card on the run's page says it is from the earlier run, as it finished before the re-run started; the earlier run's page lists its re-runs.

### Test runs

A workflow's page offers *Test run*: the form for a new run of the workflow, whose `input` takes a sample input as JSON, which every state reads as `$states.context.Execution.Input`. Creating it opens the run's page, which follows it as it runs. A test run is a run like any other: its steps do what they do, as the workflow's last editor, with the version saved last.

## Over MCP

An AI client signed in to the app's [MCP endpoint](/reference/mcp/#workflows) finds, makes, changes and test-runs workflows as the person: it lists the step types and triggers with their arguments, reads and validates definitions, saves one whole or by a small edit, starts a run with an input, reads each of the run's steps with its input, output, logs and error, and re-runs a failed run from its failed step once the workflow is fixed, turns a workflow's trigger on and off, and issues a webhook trigger's URL. The endpoint's instructions describe this language, and a refused definition comes back with its problems, each naming the state and field.

## Who may do what

The workflow resources take only [named grants](/reference/access/#resources-that-need-named-grants): a role's wildcard such as `*.read` reaches none of them, since a run reads and sends data as its definition says.

| Grant | |
| --- | --- |
| `workflows.create`, `workflows.update`, `workflows.delete` | Make, change and delete workflows, and turn them on and off. Each save that changes the definition makes the saver the workflow's last editor, whom its records steps and its trigger act as. |
| `workflow_runs.create` | Run a workflow, with any input. The API writes only the fields a caller reads, so it goes with `workflow_runs.read`, and the caller must read the workflow too. |
| `workflows.read`, `workflow_versions.read`, `workflow_runs.read`, `workflow_steps.read`, `workflow_triggers.read` | Read workflows, their versions, runs, steps and triggers, the steps' inputs and outputs included. |

```ts
defineRoles({
  admin: ['*'],
  builder: ['workflows.*', 'workflow_versions.read', 'workflow_runs.*', 'workflow_steps.read'],
})
```

All five are scoped to the tenant like any resource with `.tenant()`. A run takes its workflow's tenant; a start of another tenant's workflow is refused as one of a workflow that is not there.

## How a run is run

The runner is `@protobase/workflows`, a package with no other Protobase dependency, over a narrow port: where runs and steps are kept (here the `workflows` schema), the queue that runs them (here the app's [jobs](/reference/jobs/)), and the step types.

- A run is run in **segments**, each a `workflows.segment` job whose payload is the run's id alone: one runs the run from where it stands to its next wait, then queues the next. A Wait whose time is still ahead, or a retry's delay, saves its step with the time the run goes on, ends the segment and queues the next one for that time, so a waiting run holds no worker. A segment hands the rest of the run on after a minute of steps.
- Where a run stands is read from its saved steps. A Task's step, and one with a time the run goes on at, is saved before the next state runs; the steps of other states are kept and saved with it, or as the segment ends. Each save is **one statement**, unique by each step's scope and number, so a second segment of the same run that finds one taken stops.
- A worker that stops or dies mid-step leaves that step unsaved: its job is tried again and takes the run up from its last saved step, so a saved step never runs again, and the step that was in progress runs **at least once**, as do the steps kept since the last save, which give the same records again. A step whose effect happened before its result was saved, such as a request that was sent, happens again. Every try of a step gets the same idempotency key, for a step type whose receiver dedupes by it, and `app:mail.send` makes it the mail's Message-ID. `app:records.create` keeps it with the records it creates, in their transaction, so a try after they committed creates none again and returns them as the first try created them. A job whose worker died is tried again once its timeout, 10 minutes, has passed.
- A Map's items run in the segment that reaches them, each item's steps saved under its own scope; an item that waits ends the segment once the others running settle, and the next segment takes each item up where it stands. A Map's `Items` is evaluated again by a segment that takes up an unfinished Map.
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
| The input, output and variables a step saves | 1 MiB each, as JSON; beyond, the step fails with `States.DataLimitExceeded`. |
| A step's logs | 100 lines of 1,000 characters; more lines are left out with a last line saying how many. |
| A run's input | 1 MiB as JSON, 64 levels deep. |
| An answer `app:http` reads, a file a run keeps | 10 MiB. |
| A Wait | 366 days, by `Seconds` or `Timestamp`. |
