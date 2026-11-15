import { describe, expect, it } from 'vitest'
import { compile } from '../expressions'
import { importHttpTask } from './http-task'
import { httpTaskResult } from './result-shape'

const arn = 'arn:aws:events:eu-west-1:123456789012:connection/tickets/0b1c'
const connections = { [arn]: { header: 'Authorization', secret: 'TICKETS_TOKEN' } }
const task = (args: unknown, more: Record<string, unknown> = {}) => ({ Type: 'Task', Resource: 'arn:aws:states:::http:invoke', Arguments: args, End: true, ...more })
const post = { ApiEndpoint: 'https://a.example/tickets', Method: 'POST', Authentication: { ConnectionArn: arn }, RequestBody: '{% $states.input.text %}' }
const imported = (state: Record<string, unknown>) => importHttpTask(state, 'Call', connections)

describe('importHttpTask', () => {
  it('maps the arguments to app:http, the body sent as JSON and the connection as a secret header', () => {
    const args = { ...post, Headers: { 'x-team': 'a', authorization: 'kept out' }, QueryParameters: { page: '1' } }
    expect(imported(task(args))).toEqual({
      problems: [],
      state: {
        Type: 'Task',
        Resource: 'app:http',
        End: true,
        Arguments: { url: 'https://a.example/tickets', method: 'POST', headers: { 'x-team': 'a', Authorization: '{% $states.context.Secrets.TICKETS_TOKEN %}' }, query: { page: '1' }, body: '{% $states.input.text %}', body_encoding: 'json' },
        Output: `{% ${httpTaskResult} %}`,
      },
    })
  })

  it("merges the connection's header into headers written as an expression when the step runs", async () => {
    const { state } = imported(task({ ...post, Headers: '{% $states.input.headers %}' }))
    const headers = (state.Arguments as { headers: string }).headers
    const value = await compile(headers.slice(2, -2)).evaluate({}, { states: { input: { headers: { AUTHORIZATION: 'old', 'x-a': 'b' } }, context: { Secrets: { TICKETS_TOKEN: 'Bearer t' } } } })
    expect(value).toEqual({ 'x-a': 'b', Authorization: 'Bearer t' })
  })

  it('reads the HTTP task\'s result in Output and Assign, and sends nothing for a connection given null', () => {
    const { state } = importHttpTask(task({ ...post, Authentication: undefined, InvocationConfig: { ConnectionArn: arn } }, { Output: '{% $states.result.ResponseBody %}', Assign: { whole: '{% $states.result %}' } }), 'Call', { [arn]: null })
    expect(state.Output).toBe(`{% ${httpTaskResult}.ResponseBody %}`)
    expect(state.Assign).toEqual({ whole: `{% ${httpTaskResult} %}` })
    expect((state.Arguments as Record<string, unknown>).headers).toBeUndefined()
  })

  it('refuses an Output or Assign whose reads of the result the import does not reach', () => {
    expect(imported(task(post, { Assign: { a: '{% $states . result.ResponseBody %}' } })).problems).toEqual([{ state: 'Call', field: 'Assign.a', message: expect.stringMatching(/^reads the HTTP task's result/) }])
  })

  it('refuses by name what app:http would not do exactly', () => {
    expect(imported(task('{% $states.input.request %}')).problems).toEqual([{ state: 'Call', field: 'Arguments', message: expect.stringMatching(/^is one expression/) }])
    const args = { ...post, Method: 'head', Transform: { RequestBodyEncoding: 'URL_ENCODED' }, Headers: { accept: ['a', 'b'] }, QueryParameters: 'a=1' }
    const retry = { Retry: [{ ErrorEquals: ['States.Http.StatusCode.429', 'States.ALL'] }], Catch: [{ ErrorEquals: ['States.Http.Socket', 'States.TaskFailed'], Next: 'Done' }] }
    expect(imported(task(args, retry)).problems.map(({ field }) => field)).toEqual([
      'Arguments.Transform',
      'Arguments.Method',
      'Arguments.Headers.accept',
      'Arguments.QueryParameters',
      'Retry[0].ErrorEquals[0]',
      'Catch[0].ErrorEquals[0]',
      'Catch[0].ErrorEquals[1]',
    ])
    expect(imported(task({ ...post, Method: 'GET', RequestBody: {} })).problems).toEqual([{ state: 'Call', field: 'Arguments.RequestBody', message: expect.stringMatching(/with GET/) }])
  })

  it('asks for the header of a connection it is not given, and refuses a connection it cannot read', () => {
    expect(importHttpTask(task(post), 'Call', {}).problems).toEqual([{ state: 'Call', field: 'Arguments.Authentication.ConnectionArn', message: expect.stringContaining(`connection_headers { "${arn}": { "header": "Authorization"`) }])
    expect(importHttpTask(task(post), 'Call', { [arn]: { header: 'Auth orization', secret: 'X' } }).problems[0]?.message).toMatch(/not a header name/)
    expect(importHttpTask(task(post), 'Call', { [arn]: { header: 'Authorization', secret: 'a-b' } }).problems[0]?.message).toMatch(/not a secret's name/)
    expect(importHttpTask(task(post), 'Call', { [arn]: { header: 'Authorization', secret: 'true' } }).problems[0]?.message).toMatch(/not a secret's name/)
    expect(imported(task({ ...post, Authentication: { ConnectionArn: '{% $arn %}' } })).problems.map(({ field }) => field)).toEqual(['Arguments.Authentication.ConnectionArn'])
    expect(imported(task({ ...post, InvocationConfig: { ConnectionArn: arn } })).problems.map(({ field }) => field)).toEqual(['Arguments.InvocationConfig'])
  })
})
