import type { stepTypeNames } from '../step-types'

type StepTypeName = (typeof stepTypeNames)[number]

/** An argument of a step type: whether a Task must give it, and what it takes. */
type Argument = { required: boolean; takes: string }

/** What a model reads of a step type: what it does, its `Arguments`, its result and the errors it fails with. */
export type StepTypeEntry = { resource: StepTypeName; does: string; arguments: Record<string, Argument>; result: string; errors: string[] }

/** What a model reads of a trigger: how `trigger` holds it, when it starts a run, and the run's input. */
export type TriggerEntry = { trigger: string; example: unknown; starts: string; input: string }

const needs = (takes: string): Argument => ({ required: true, takes })
const may = (takes: string): Argument => ({ required: false, takes })

const resource = needs("the resource's name, as list_resources gives it")
const key = needs("the record's key")
const refused = ['Records.Refused: the API refused it, its status and message in the cause', 'Records.InvalidArguments: an argument has the wrong type, named in the cause']

/** The step types a Task names as its `Resource`, as the workflows reference describes them. */
export const stepTypeCatalog: StepTypeEntry[] = [
  {
    resource: 'app:http',
    does: 'Sends one HTTP request to a public address and reads the answer.',
    arguments: {
      url: needs('an http or https URL'),
      method: may('GET (default), POST, PUT, PATCH or DELETE'),
      headers: may('an object of text values'),
      query: may("an object of text values, added to the URL's query"),
      body: may('text sent as it is, a file value sent as its bytes, any other value sent as JSON; a GET sends none'),
      response: may("how the answer's body is read: json (default; empty is null), text, or file (kept as a file value of the run)"),
    },
    result: '{ status, headers, body }',
    errors: ['Http.Status: a status outside 2xx; the cause names it with the start of the body', 'Http.Network: no answer', 'Http.InvalidArguments: an argument has the wrong type, named in the cause', 'Http.InvalidBody: response json, and the body is not JSON', 'Http.AddressRefused: the host is not a public address', 'Http.ResponseTooLarge: a body over 10 MiB'],
  },
  {
    resource: 'app:records.create',
    does: "Creates records of the app's resources, as the workflow's last editor.",
    arguments: { resource, data: needs('an object of field values, or a list of them, created in one batch: all or none') },
    result: 'the created record, or the list of them',
    errors: refused,
  },
  {
    resource: 'app:records.update',
    does: "Updates one record, as the workflow's last editor.",
    arguments: { resource, key, data: needs('an object of the field values to change') },
    result: 'the updated record',
    errors: refused,
  },
  {
    resource: 'app:records.get',
    does: "Reads one record, as the workflow's last editor.",
    arguments: { resource, key },
    result: 'the record',
    errors: refused,
  },
  {
    resource: 'app:records.list',
    does: "Lists records, as the workflow's last editor.",
    arguments: { resource, filter: may('a filter in the API\'s syntax, such as status = "open"'), order_by: may('such as "created_at desc"'), limit: may('how many at most') },
    result: '{ records }',
    errors: refused,
  },
  {
    resource: 'app:mail.send',
    does: "Sends a mail from the app's own sender.",
    arguments: {
      to: needs('one address, or a list of at most 50'),
      subject: needs('one line of text'),
      text: needs('the body as text'),
      html: may('the body as HTML too'),
      attachments: may('a list of file values the run keeps, at most 10 MiB together'),
    },
    result: '{ message_id }',
    errors: ['Mail.InvalidArguments: an argument has the wrong type, named in the cause', 'States.TaskFailed: the app sends no mail, or the mailer refused it'],
  },
  {
    resource: 'app:piece',
    does: 'Runs an action of a connector. Not implemented yet: a run fails it.',
    arguments: { piece: needs("the connector's name"), action: needs('one of its actions'), connection: needs('the connection holding its sign-in'), props: may("the action's arguments, by name") },
    result: 'what the action returns',
    errors: ['Piece.Error: always, until connectors are implemented'],
  },
]

/** The triggers a definition's `trigger` holds exactly one of. */
export const triggerCatalog: TriggerEntry[] = [
  { trigger: 'manual', example: { manual: {} }, starts: 'when someone runs the workflow, such as with run_workflow', input: 'the input they give' },
  { trigger: 'webhook', example: { webhook: {} }, starts: "on each POST to the workflow's webhook address", input: '{ body, headers, query }' },
  { trigger: 'schedule', example: { schedule: { cron: '0 6 * * 1-5', timezone: 'Europe/Amsterdam' } }, starts: 'on a 5-field cron, in an IANA time zone (default UTC)', input: "{ scheduled_at }, ISO 8601 with the zone's offset" },
  { trigger: 'mail', example: { mail: { mailbox: 'support' } }, starts: 'on each mail arriving in that mailbox', input: '{ from, to, subject, text, html, received_at, attachments }' },
  { trigger: 'record', example: { record: { events: ['orders.created'] } }, starts: 'on each of those record events, <resource>.<event>', input: '{ event, resource, key, after, before, changed }' },
]

/** Only manual runs start for now: a save takes the other triggers, which start nothing yet. */
export const triggerNote = 'Runs start only by hand (run_workflow) for now: a workflow saves with any trigger, and the other triggers start no runs yet.'
