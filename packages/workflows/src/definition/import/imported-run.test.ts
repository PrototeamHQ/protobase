import { expect, it } from 'vitest'
import { memoryRunner } from '../../run/memory-port'
import type { Definition } from '../types'
import { importStateMachine } from './import-machine'

it('runs an imported HTTP task so its Output, its Assign and later reads of the variable see the HTTP task\'s result', async () => {
  const sent: unknown[] = []
  const port = memoryRunner({
    'app:http': async (args) => {
      sent.push(args)
      return { status: 200, status_text: 'OK', headers: { 'content-type': 'application/json' }, body: { items: [{ id: 1 }] } }
    },
  })
  const { stateMachine } = importStateMachine({
    QueryLanguage: 'JSONata',
    StartAt: 'Call',
    States: {
      Call: { Type: 'Task', Resource: 'arn:aws:states:::http:invoke', Arguments: { ApiEndpoint: 'https://a.example', Method: 'POST', RequestBody: '{% $states.input.text %}' }, Assign: { answer: '{% $states.result %}' }, Next: 'Plain' },
      Plain: { Type: 'Task', Resource: 'arn:aws:states:::http:invoke', Arguments: { ApiEndpoint: 'https://a.example', Method: 'GET' }, Output: '{% $states.result.ResponseBody.items %}', Next: 'Done' },
      Done: { Type: 'Pass', Output: '{% { "status": $answer.StatusCode, "type": $answer.Headers.`content-type`[0], "items": $states.input } %}', End: true },
    },
  })
  await port.start('r1', { trigger: { manual: {} }, stateMachine } as unknown as Definition, { text: 'hi' })
  await port.drain()
  expect(sent[0]).toEqual({ url: 'https://a.example', method: 'POST', body: 'hi', body_encoding: 'json' })
  expect(port.run('r1')).toMatchObject({ status: 'succeeded', output: { status: 200, type: 'application/json', items: [{ id: 1 }] } })
  expect(port.steps[0]!.output).toEqual({ StatusCode: 200, StatusText: 'OK', Headers: { 'content-type': ['application/json'] }, ResponseBody: { items: [{ id: 1 }] } })
})
