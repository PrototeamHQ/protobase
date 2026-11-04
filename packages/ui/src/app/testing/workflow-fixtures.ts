import type { Definition } from '@protobase/workflows'

/**
 * A workflow with every kind of edge: it fetches tickets, branches on how many there are, mails each by a Map, and
 * catches a failed fetch. The tests and stories draw and edit it.
 */
export const ticketsWorkflow: Definition = {
  trigger: { schedule: { cron: '0 8 * * 1', timezone: 'Europe/Amsterdam' } },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Fetch',
    States: {
      Fetch: {
        Type: 'Task',
        Resource: 'app:http',
        Arguments: { url: 'https://tickets.example.com/open' },
        Assign: { tickets: '{% $states.result.body.items %}' },
        Catch: [{ ErrorEquals: ['States.ALL'], Next: 'Failed' }],
        Next: 'Any',
      },
      Any: { Type: 'Choice', Choices: [{ Condition: '{% $count($tickets) > 0 %}', Next: 'Each' }], Default: 'Done' },
      Each: {
        Type: 'Map',
        Items: '{% $tickets %}',
        ItemProcessor: {
          StartAt: 'Mail',
          States: {
            Mail: { Type: 'Task', Resource: 'app:mail.send', Arguments: { to: '{% $states.input.owner %}', subject: 'Open ticket', text: '{% $states.input.title %}' }, Next: 'Sent' },
            Sent: { Type: 'Succeed' },
          },
        },
        Next: 'Done',
      },
      Done: { Type: 'Succeed' },
      Failed: { Type: 'Fail', Error: 'Tickets.Unreachable' },
    },
  },
}
