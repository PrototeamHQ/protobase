import { limits } from '@protobase/workflows'

const example = {
  trigger: { manual: {} },
  execution_order: 'sequence',
  state_machine: {
    QueryLanguage: 'JSONata',
    StartAt: 'GetQuote',
    States: {
      GetQuote: {
        Type: 'Task',
        Resource: 'app:records.get',
        Arguments: { resource: 'quotes', key: '{% $states.context.Execution.Input.quote_id %}' },
        Assign: { quote: '{% $states.result %}' },
        Next: 'IsDraft',
      },
      IsDraft: { Type: 'Choice', Choices: [{ Condition: "{% $quote.status = 'draft' %}", Next: 'Notify' }], Default: 'NotADraft' },
      NotADraft: { Type: 'Fail', Error: 'Quote.NotDraft', Cause: "{% 'Quote ' & $quote.id & ' is not a draft' %}" },
      Notify: {
        Type: 'Task',
        Resource: 'app:http',
        Arguments: { method: 'POST', url: 'https://hooks.example.com/quotes', body: { id: '{% $quote.id %}', total: '{% $quote.total %}' } },
        Retry: [{ ErrorEquals: ['States.ALL'], IntervalSeconds: 10, MaxAttempts: 3 }],
        Catch: [{ ErrorEquals: ['States.ALL'], Next: 'Failed', Assign: { notifyError: '{% $states.errorOutput %}' } }],
        Output: '{% $states.result.body %}',
        End: true,
      },
      Failed: { Type: 'Fail', Error: 'Notify.Failed', Cause: '{% $notifyError.Cause %}' },
    },
  },
}

// The same order in data order: two requests at once, a write that reads both, and mail once the write succeeded
const dataExample = {
  execution_order: 'data',
  state_machine: {
    QueryLanguage: 'JSONata',
    States: {
      Rate: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://rates.example.com/eur' }, Assign: { rate: '{% $states.result.body %}' } },
      Stock: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://stock.example.com/42' }, Assign: { stock: '{% $states.result.body %}' } },
      Save: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'products', key: '42', data: { price: '{% $rate.value * 10 %}', stock: '{% $stock.count %}' } } },
      Tell: { Type: 'Task', Resource: 'app:mail.send', Condition: "{% $states.context.Steps.Save.Status = 'SUCCEEDED' %}", Arguments: { to: 'ops@example.com', subject: 'Product 42 updated', text: 'Done' } },
    },
  },
}

/**
 * What the MCP endpoint tells a client about workflows, beside reading records: the language, in the named-reads
 * profile of the States Language with JSONata, and how the workflow tools find, make, change and test-run them.
 */
export const workflowInstructions = [
  'Workflows: list_workflow_types names the step types and triggers with their arguments and inputs; list_workflows and get_workflow read workflows; validate_workflow checks a definition without saving it; create_workflow and update_workflow save one; run_workflow starts a run with an input, and get_workflow_run reads it with each step of its trace, with its input, output, logs and error. A run goes on in the background: read it again until its status is succeeded or failed, then fix the step that failed with update_workflow and run it again. A save makes a new version and never goes live: run_workflow tries the version saved last, and a trigger starts runs only on the version enable_workflow published. A webhook trigger whose sender you give a URL, such as app:webhook, gets its URL and secret from new_webhook_url, shown once; one that registers its own URL with its service as the workflow is turned on needs none, and new_webhook_url refuses it. A step or trigger that signs in through a connection uses the account the workflow\'s "connections" binds, { "<connection key>": "<account id>" }: list_connections gives your accounts.',
  'A workflow\'s definition is its fields: state_machine, the States Language with JSONata expressions in a profile where every value is read by name, exactly as AWS Step Functions takes and gives one ({ "QueryLanguage": "JSONata", "StartAt": "<state>", "States": { "<state>": <state>, ... } }; a JSONata machine exported from Step Functions imports, its HTTP tasks as app:http steps, each connection\'s header given in connection_headers); trigger, an object with one key: { "<trigger id>": <its input> } for a trigger list_workflow_types names, or { "manual": {} } (the default) for a workflow that runs only when someone starts it; and execution_order, "sequence" (the default) or "data". A workflow\'s layout, beside its definition, keeps only the editor\'s nodes moved by hand, in each view of its graph apart ({ "pins": { ... }, "simple": { ... } }); leave it out, and the editor lays the graph out.',
  'Execution order "data": the state machine has no StartAt and its states no Next or End. A state runs once every state whose variables or $states.context.Steps.<state> it reads has ended, and states that read nothing of each other run at once. $states.context.Steps.<state> is { Status, Error, Cause }, Status one of SUCCEEDED, FAILED, TIMED_OUT, ABORTED and SKIPPED. A state\'s Condition (an expression) decides whether it runs; false skips it. A state one of whose dependencies did not succeed is skipped too, unless its Condition reads that dependency\'s $states.context.Steps entry. An uncaught failure fails the run at once; a Catch without Next keeps it going, the state\'s Status FAILED and its catcher\'s Assign set. Order without data: a Condition reading the earlier state\'s Status, such as {% $states.context.Steps.Save.Status = \'SUCCEEDED\' %}. Choice and Succeed are not used; each variable has one state that assigns it. Data order fits work whose steps do not depend on each other; the default sequence order is the standard States Language.',
  'States: Task { Resource: <step type>, Arguments, TimeoutSeconds, HeartbeatSeconds, Retry, Catch }; Pass { Output, Assign }; Choice { Choices: [{ Condition, Next, Output?, Assign? }], Default }; Map { Items, ItemProcessor: { StartAt, States }, MaxConcurrency }; Block { Arguments, Processor: { StartAt, States }, Cache: { Ttl, Key? }, Retry, Catch }; Wait { Seconds | Timestamp }; Succeed { Output }; Fail { Error, Cause }. Every state may have Comment, Output and Assign. Task, Pass, Map, Block and Wait have exactly one of Next (a state name) and End: true. A Block runs its Processor once as a run of its own on its Arguments, which its states read as $states.context.Execution.Input (never the variables around it), and keeps the result for Ttl (such as "1 hour"): a later visit, in this run or another, whose states read the same values gets that result without running them; its result is $states.result in its Output and Assign. State names are unique across the document, Maps and Blocks included, and every state must be reachable from StartAt. InputPath, Parameters, ResultPath and the other JSONPath fields, and Parallel, are not part of the profile.',
  'Expressions: a string that is whole "{% ... %}" is a JSONata expression whose value, of any type, the field takes; any other string is literal text. Build text inside one expression with &: "{% \'Order \' & $order.id %}". Expressions sit at any depth in Arguments, Output and Assign, and in Items, Condition, Seconds, Timestamp, Error and Cause.',
  'Reading values by name, the only reads allowed: $states.context.Execution.Input (the run\'s input, in every state), $states.context.Execution.StartTime, $states.context.Secrets.<NAME> (a secret the app lists), $<variable> (assigned by a state that runs before), $states.result (a Task\'s or Map\'s result, in its Output and Assign), $states.errorOutput ({ Error, Cause }, in a Catch rule\'s Output and Assign), $states.input (the item, only in the first state of a Map\'s ItemProcessor). Never a bare field name, $ or $$ on its own, or $eval. Keep a result for later states with "Assign": { "order": "{% $states.result %}" }, read as $order from the next state on; a state inside a Map may not assign a name an outer state assigns.',
  `Errors: a failing Task or Map fails with an error name, its step type's own (list_workflow_types names them), States.Timeout, States.TaskFailed, or States.QueryEvaluationError for an expression that failed. Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds, MaxAttempts (retries after the first try, at most ${limits.retryAttempts}), BackoffRate }]; Catch: [{ ErrorEquals, Next, Assign }] goes on to Next once no retry is left; without a Catch the run fails. A Choice whose rules all fail and that has no Default fails with States.NoChoiceMatched.`,
  'Runs: a step that changes the world (mail, a record written, an http call other than GET) is recorded: once its checkpoint is saved it does not happen again, but one a crash cut off before that may; a read (a GET, records.get, records.list) is done again after a crash before the next checkpoint. $now() and $millis() give the time of the last checkpoint (in a recorded Task\'s Output and Assign, when its result was fetched); $random() is the same when a crash makes a step run again, and new on each retry. A workflow\'s "trace" ("all", "failed" or "none") sets which runs keep a trace.',
  `Waiting for an outside result: a Task whose Resource is a step type followed by .waitForTaskToken, such as app:http.waitForTaskToken, runs that type with Arguments that pass on $states.context.Task.Token (readable only there), then waits, holding nothing, until someone sends that token back: send_task_success with its result (the Task's $states.result), send_task_failure with an error and cause, or send_task_heartbeat while the work goes on; outside callers POST { taskToken, output } to /api/workflows/tasks/success, { taskToken, error, cause } to .../failure and { taskToken } to .../heartbeat. Its TimeoutSeconds (from the try's start, its hand-off included, up to ${limits.waitingTaskTimeoutSeconds}, that by default) fails it with States.Timeout, and with HeartbeatSeconds, shorter, a heartbeat overdue fails it with States.HeartbeatTimeout; each retry hands off again with a new token.`,
  `Limits: ${limits.states} states, a Map's MaxConcurrency ${limits.mapConcurrency}, a Task's TimeoutSeconds ${limits.taskTimeoutSeconds} (one that waits for an outside result, ${limits.waitingTaskTimeoutSeconds}).`,
  `A saved or validated definition that does not fit is refused with problems, each { state, field, message }: the state (a Map's inner state as Map/State), the field such as Arguments.url, and what was expected. Fix those fields and try again; nothing was saved. An example: ${JSON.stringify(example)}. In data order: ${JSON.stringify(dataExample)}`,
].join('\n')

/**
 * What the MCP endpoint tells a client about custom steps in an app that turns them on: the manifest, the contract
 * between a job and its container, and how the tools build, test and use one. Fixed text, as the workflows' is.
 */
export const customStepInstructions = [
  'Custom steps: a step type of your own, built from a Dockerfile and run in a container on one of the app\'s runners, machines a person installs with the command create_runner_token gives; list_runners says which are online, with their platform and free slots. save_custom_step saves one from its manifest: name (custom:<name>:<version> in a Task, set on create), label, description, container { dockerfile, files: { "<relative path>": "<text>" }, command: ["<program>", "<argument>"] }, input and output (JSON Schemas of objects; a property { "x-file": true } is a file), error_prefix and errors ({ "<Name>": "<what it means>" }, failing as <error_prefix>.<Name>). Each save that changes the manifest is the next version, a step type of its own, so a workflow keeps the version it names. The Dockerfile starts FROM a public image and copies only its own files; its container has no network.',
  'A custom step\'s container: $PROTOBASE_INPUT is the path of input.json, its arguments without store, each file argument as { path, name, type, size }, the file already at that path under $PROTOBASE_IN, read-only; each argument that is a string, number or boolean is also the variable INPUT_<NAME> (its name in capitals, other characters _). It writes its result as $PROTOBASE_OUT/output.json, checked against output, each file property a path relative to $PROTOBASE_OUT, such as "clip.mp4", which the runner stores where the store argument, { configuration, path? }, says. It fails by writing $PROTOBASE_OUT/error.json { "error": "<Name>", "cause": "..." }, one of its errors; any other exit than 0 fails it with Custom.Failed and the end of its stderr as the cause, and an output that does not fit, with Custom.InvalidOutput. What it writes to stdout and stderr is its log.',
  'Making one: save_custom_step with wait_seconds waits for the runners that build images to build the new version, ready with the image\'s digest or failed with the end of the build\'s log (no_runner while none that builds is online); get_custom_step reads its versions and builds later. test_custom_step runs one job of a version on an input, file arguments as stored files { configuration, path, name, type, size }, and gives its output or its error, cause and the end of its log: fix the manifest, save the next version and test again until it gives what it should. Then name the version in a Task, "Resource": "custom:<name>:<version>", with its arguments and store, and check it with validate_workflow; list_workflow_types lists each version with its input, output, errors and build. A Task of a custom step waits 300 seconds by default, its time in the queue included; give a longer TimeoutSeconds for longer work.',
].join('\n')
