import { limits } from '@protobase/workflows'

const example = {
  trigger: { manual: {} },
  stateMachine: {
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

/**
 * What the MCP endpoint tells a client about workflows, beside reading records: the language, in the named-reads
 * profile of the States Language with JSONata, and how the workflow tools find, make, change and test-run them.
 */
export const workflowInstructions = [
  'Workflows: list_workflow_types names the step types and triggers with their arguments and inputs; list_workflows and get_workflow read workflows; validate_workflow checks a definition without saving it; create_workflow and update_workflow save one; run_workflow starts a run with an input, and get_workflow_run reads it with each step\'s input, output, logs and error. A run goes on in the background: read it again until its status is succeeded or failed, then fix the step that failed with update_workflow and run it again.',
  'A definition is one JSON document: { "trigger": <trigger>, "stateMachine": { "QueryLanguage": "JSONata", "StartAt": "<state>", "States": { "<state>": <state>, ... } } }, the States Language with JSONata expressions, in a profile where every value is read by name. It holds no layout. <trigger> is an object with one key: { "<trigger id>": <its input> } for a trigger list_workflow_types names, or { "manual": {} } for a workflow that runs only when someone starts it.',
  'States: Task { Resource: <step type>, Arguments, TimeoutSeconds, Retry, Catch }; Pass { Output, Assign }; Choice { Choices: [{ Condition, Next, Output?, Assign? }], Default }; Map { Items, ItemProcessor: { StartAt, States }, MaxConcurrency }; Wait { Seconds | Timestamp }; Succeed { Output }; Fail { Error, Cause }. Every state may have Comment, Output and Assign. Task, Pass, Map and Wait have exactly one of Next (a state name) and End: true. State names are unique across the document, Maps included, and every state must be reachable from StartAt. InputPath, Parameters, ResultPath and the other JSONPath fields, and Parallel, are not part of the profile.',
  'Expressions: a string that is whole "{% ... %}" is a JSONata expression whose value, of any type, the field takes; any other string is literal text. Build text inside one expression with &: "{% \'Order \' & $order.id %}". Expressions sit at any depth in Arguments, Output and Assign, and in Items, Condition, Seconds, Timestamp, Error and Cause.',
  'Reading values by name, the only reads allowed: $states.context.Execution.Input (the run\'s input, in every state), $states.context.Execution.StartTime, $states.context.Secrets.<NAME> (a secret the app lists), $<variable> (assigned by a state that runs before), $states.result (a Task\'s or Map\'s result, in its Output and Assign), $states.errorOutput ({ Error, Cause }, in a Catch rule\'s Output and Assign), $states.input (the item, only in the first state of a Map\'s ItemProcessor). Never a bare field name, $ or $$ on its own, or $eval. Keep a result for later states with "Assign": { "order": "{% $states.result %}" }, read as $order from the next state on; a state inside a Map may not assign a name an outer state assigns.',
  `Errors: a failing Task or Map fails with an error name, its step type's own (list_workflow_types names them), States.Timeout, States.TaskFailed, or States.QueryEvaluationError for an expression that failed. Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds, MaxAttempts (retries after the first try, at most ${limits.retryAttempts}), BackoffRate }]; Catch: [{ ErrorEquals, Next, Assign }] goes on to Next once no retry is left; without a Catch the run fails. A Choice whose rules all fail and that has no Default fails with States.NoChoiceMatched.`,
  `Limits: ${limits.states} states, a Map's MaxConcurrency ${limits.mapConcurrency}, a Task's TimeoutSeconds ${limits.taskTimeoutSeconds}.`,
  `A saved or validated definition that does not fit is refused with problems, each { state, field, message }: the state (a Map's inner state as Map/State), the field such as Arguments.url, and what was expected. Fix those fields and try again; nothing was saved. An example: ${JSON.stringify(example)}`,
].join('\n')
