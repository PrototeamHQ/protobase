import { describe, expect, it } from 'vitest'
import { compile } from '../expressions'
import { httpTaskResult, templateWithHttpTaskResult, withHttpTaskResult } from './result-shape'

const answer = { status: 201, status_text: 'Created', headers: { 'content-type': 'application/json', etag: '"a"' }, body: { id: 7, items: [1] } }
const evaluate = (source: string, result: unknown = answer) => compile(source).evaluate({}, { states: { result } })

describe('httpTaskResult', () => {
  it("gives app:http's answer in the HTTP task's shape, each header's value as a list", async () => {
    expect(await evaluate(httpTaskResult)).toEqual({ StatusCode: 201, StatusText: 'Created', Headers: { 'content-type': ['application/json'], etag: ['"a"'] }, ResponseBody: { id: 7, items: [1] } })
  })

  it('keeps an answer without headers or body', async () => {
    expect(await evaluate(httpTaskResult, { status: 204, status_text: 'No Content', headers: {}, body: null })).toEqual({ StatusCode: 204, StatusText: 'No Content', Headers: {}, ResponseBody: null })
  })
})

describe('withHttpTaskResult', () => {
  it('reads the HTTP task\'s fields from the answer, a list body kept as a list', async () => {
    expect(await evaluate(withHttpTaskResult('$states.result.ResponseBody.items')!)).toEqual([1])
    expect(await evaluate(withHttpTaskResult('$states.result.StatusCode = 201')!)).toBe(true)
    expect(await evaluate(withHttpTaskResult('$states.result.Headers.etag[0]')!)).toBe('"a"')
  })

  it('leaves strings, backtick names, regular expressions, comments and longer names alone', () => {
    const untouched = `"$states.result" & '$states.result' /* $states.result */ & $states.results.a & $x.\`$states.result\` & $match('a', /$states.result/)`
    expect(withHttpTaskResult(untouched)).toBe(untouched)
  })

  it("reads past a regular expression holding a quote, and tells a regular expression from a division", async () => {
    expect(await evaluate(withHttpTaskResult("$replace('a', /'/, '') & $states.result.ResponseBody.id")!)).toBe('a7')
    expect(await evaluate(withHttpTaskResult('$states.result.StatusCode / 1 / $states.result.ResponseBody.id')!)).toBeCloseTo(201 / 7)
  })

  it('gives undefined for a read it does not reach, and leaves an expression that does not parse to the check', () => {
    expect(withHttpTaskResult('$states . result.ResponseBody')).toBeUndefined()
    expect(withHttpTaskResult('$states.`result`.ResponseBody')).toBeUndefined()
    expect(withHttpTaskResult('$states.result /* note */ .ResponseBody')).toBeDefined()
    expect(withHttpTaskResult('$keys($states)')).toBeUndefined()
    expect(withHttpTaskResult('$states.result.(')).toBe('$states.result.(')
  })
})

describe('templateWithHttpTaskResult', () => {
  it('rewrites each expression of a template and keeps every other value', async () => {
    const { value, unreached } = templateWithHttpTaskResult({ id: '{% $states.result.ResponseBody.id %}', kept: ['text', 1], odd: ['{% $states . result %}'] })
    const template = value as { id: string; kept: unknown }
    expect(template.kept).toEqual(['text', 1])
    expect(await evaluate(template.id.slice(2, -2))).toBe(7)
    expect(unreached).toEqual([['odd', 0]])
  })
})
