# Writing workflows

How to write a Protobase workflow that saves, runs and goes live, over MCP or the REST API. The full language, every
state, step type and trigger, is in [the workflows reference](references/reference/workflows.md); MCP's tools are in
[MCP](references/reference/mcp.md#workflows).

## Before writing

1. Call `list_workflow_types` (REST: `GET /api/workflows/types`). It names every step type and trigger this app has,
   built-in, plugin and custom, with their arguments, results and errors. Use only those; a type it does not list is
   refused on save.
2. For a records step, find the resource and its fields first (`list_resources`, `describe_resource`). The save does
   not check a resource's name or its fields: `"resource": "contact_messages"` saves and fails when it runs.
3. Records steps act as the user who saved the workflow, with that user's roles now; mail always goes from the app's
   own sender.

## Sequence or data order

- `"execution_order": "sequence"` (the default) is the standard States Language: `StartAt`, each state's `Next` or
  `End: true`, a `Choice` to branch.
- `"execution_order": "data"`: no `StartAt`, no `Next`, no `End`, no `Choice`. A state runs once every state it reads
  from has ended, and states that read nothing of each other run at once. Use it when steps are mostly independent,
  or to branch per step with a `Condition`; the editor draws a Condition as nodes (Equals, Not equals, Greater, Less,
  Matches, All of, Any of, Not), any other expression as one Expression node.

Data order's rules, each checked against the save or a run:

- A step's result reaches later steps only through a variable it assigns: `"Assign": { "contact": "{% $states.result %}" }`,
  read as `$contact.id`. Reading `$contact` with no state assigning it is refused on save, naming the state and field.
- `$states.context.Steps.<State>` is that state's `{ Status, Error, Cause }`, `Status` one of `SUCCEEDED`, `FAILED`,
  `TIMED_OUT`, `ABORTED` and `SKIPPED`. It never holds the result: `$states.context.Steps.Save.result` saves, and is
  empty at run time.
- `Condition` is an expression; when it is false the state is skipped. A state reading one that did not succeed is
  skipped too, unless its Condition reads that state's Status: `{% $states.context.Steps.Save.Status = 'SUCCEEDED' %}`.
- Each variable is assigned by one state. An uncaught failure fails the run at once.
- A skipped state is not in the run's trace; read `$states.context.Steps.<State>.Status` or the run's graph instead.

## Where the trigger's input arrives

Every state reads the run's input as `$states.context.Execution.Input`:

| Trigger | Input |
| --- | --- |
| `{ "manual": {} }` | what the start passed, such as `run_workflow`'s `input` |
| `app:webhook` | `{ method, query, headers, body, received_at }`: a form's fields are `...Input.body.<field>` |
| `app:record` | `{ resource, key, record }`: `...Input.record.<field>`; the resource must declare events |
| `app:schedule` | `{ scheduled_at }` |

## From a definition to a live workflow

| Step | MCP | REST |
| --- | --- | --- |
| Check without saving | `validate_workflow` | (a create that does not fit saves nothing) |
| Save version 1 | `create_workflow` | `POST /api/v1/workflows` `{ name, description, trigger, execution_order, state_machine }` |
| Try it | `run_workflow` with an input shaped as the trigger gives it, such as `{ "body": { ... } }` for a webhook | `POST /api/v1/workflow_runs` `{ workflow_id, input }` |
| Read the run | `get_workflow_run`, again until `succeeded` or `failed` | `GET /api/v1/workflow_runs/<id>`, steps at `GET /api/workflows/runs/<id>/trace` |
| Fix | `update_workflow` (a JSON Merge Patch in `edit`), then run again | `PATCH /api/v1/workflows/<id>` with `If-Match` |
| Publish | `enable_workflow` `{ id, enabled: true, version }` | `PATCH /api/v1/workflows/<id>` `{ "enabled_version": 1 }` with `If-Match` |
| Webhook URL | `new_webhook_url` `{ id, secret? }` | `POST /api/workflows/<id>/webhook` `{ "secret": "..." }` |

A REST `PATCH` needs `If-Match`: the ETag the record was read with, or `*`; without it the answer is 428. A save
never goes live: a trigger starts runs only of the published version. A refused save answers problems, each
naming the state, the field and what was expected; fix those and save again. The webhook URL and secret are shown once.
A test run does what its steps do: it sends the mail and writes the records.

## Examples

A website contact form, in data order: the sender becomes a lead contact with the message as a note, sales or support
is mailed by the topic, and the sender gets an auto-reply when the stored address looks valid. The routing Conditions
show as Equals and Not equals nodes, the address check as a Matches node.

```json
{
  "name": "Contact form",
  "trigger": { "app:webhook": { "auth": { "mode": "bearer" }, "per_minute": 30 } },
  "execution_order": "data",
  "state_machine": {
    "QueryLanguage": "JSONata",
    "States": {
      "SaveContact": {
        "Type": "Task",
        "Resource": "app:records.create",
        "Arguments": { "resource": "contacts", "data": { "name": "{% $states.context.Execution.Input.body.name %}", "email": "{% $states.context.Execution.Input.body.email %}", "status": "lead" } },
        "Assign": { "contact": "{% $states.result %}" }
      },
      "SaveMessage": {
        "Type": "Task",
        "Resource": "app:records.create",
        "Arguments": { "resource": "notes", "data": { "contact_id": "{% $contact.id %}", "text": "{% '[' & $states.context.Execution.Input.body.topic & '] ' & $states.context.Execution.Input.body.message %}" } },
        "Assign": { "note": "{% $states.result %}" }
      },
      "NotifySales": {
        "Type": "Task",
        "Resource": "app:mail.send",
        "Condition": "{% $states.context.Execution.Input.body.topic = 'sales' %}",
        "Arguments": { "to": "sales@example.com", "subject": "{% 'New sales enquiry from ' & $contact.name %}", "text": "{% $contact.name & ' <' & $contact.email & '> wrote:\n\n' & $states.context.Execution.Input.body.message & '\n\nNote ' & $note.id %}" }
      },
      "NotifySupport": {
        "Type": "Task",
        "Resource": "app:mail.send",
        "Condition": "{% $states.context.Execution.Input.body.topic != 'sales' %}",
        "Arguments": { "to": "support@example.com", "subject": "{% 'New support request from ' & $contact.name %}", "text": "{% $contact.name & ' <' & $contact.email & '> wrote:\n\n' & $states.context.Execution.Input.body.message & '\n\nNote ' & $note.id %}" }
      },
      "AutoReply": {
        "Type": "Task",
        "Resource": "app:mail.send",
        "Condition": "{% $contains($contact.email, /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/) %}",
        "Arguments": { "to": "{% $contact.email %}", "subject": "We received your message", "text": "{% 'Hi ' & $contact.name & ',\n\nThanks for getting in touch; we will answer within one working day.' %}" }
      }
    }
  }
}
```

Then publish version 1 and issue the URL; the form's server POSTs `{ "name", "email", "topic", "message" }` to it with
`Authorization: Bearer <secret>` and gets `202 { run_id }`.

A welcome mail to each new contact, in sequence, from a record trigger:

```json
{
  "name": "Welcome new contacts",
  "trigger": { "app:record": { "resource": "contacts" } },
  "execution_order": "sequence",
  "state_machine": {
    "QueryLanguage": "JSONata",
    "StartAt": "HasEmail",
    "States": {
      "HasEmail": { "Type": "Choice", "Choices": [{ "Condition": "{% $type($states.context.Execution.Input.record.email) = 'string' %}", "Next": "Welcome" }], "Default": "NoEmail" },
      "Welcome": {
        "Type": "Task",
        "Resource": "app:mail.send",
        "Arguments": { "to": "{% $states.context.Execution.Input.record.email %}", "subject": "Welcome", "text": "{% 'Hi ' & $states.context.Execution.Input.record.name & ', welcome aboard.' %}" },
        "Retry": [{ "ErrorEquals": ["States.ALL"], "IntervalSeconds": 60, "MaxAttempts": 3 }],
        "End": true
      },
      "NoEmail": { "Type": "Succeed" }
    }
  }
}
```

A weekday digest of new leads, in data order, mailed only when there are any:

```json
{
  "name": "Daily leads",
  "trigger": { "app:schedule": { "cron": "0 8 * * 1-5", "timezone": "Europe/Amsterdam" } },
  "execution_order": "data",
  "state_machine": {
    "QueryLanguage": "JSONata",
    "States": {
      "Leads": {
        "Type": "Task",
        "Resource": "app:records.list",
        "Arguments": { "resource": "contacts", "filter": "status = 'lead'", "order_by": "created_at desc", "limit": 50 },
        "Assign": { "leads": "{% $states.result.records %}" }
      },
      "Digest": {
        "Type": "Task",
        "Resource": "app:mail.send",
        "Condition": "{% $count($leads) > 0 %}",
        "Arguments": { "to": "sales@example.com", "subject": "{% $string($count($leads)) & ' open leads' %}", "text": "{% $join($leads.(name & ' <' & email & '>'), '\n') %}" }
      }
    }
  }
}
```
