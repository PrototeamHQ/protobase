import { describe, expect, it } from 'vitest'
import { manifestProblems } from '../plugin/custom-steps'
import { fileProperties } from './job-contract'

const manifest = { name: 'convert', label: 'Convert', container: { dockerfile: 'FROM alpine', files: {} }, input: { type: 'object' }, output: { type: 'object' }, error_prefix: 'Convert', errors: {} }

describe("a schema's file properties", () => {
  it('are its own properties marked x-file, every place a manifest may mark one', () => {
    const output = { type: 'object', properties: { video: { 'x-file': true }, poster: { 'x-file': true, title: 'Poster' }, seconds: { type: 'number' } } }
    expect(manifestProblems({ ...manifest, output })).toEqual([])
    expect(fileProperties(output)).toEqual(['video', 'poster'])
    expect(fileProperties({ type: 'object' })).toEqual([])
    // A mark it would not find is refused as the manifest is saved, so no file a container gives is lost
    for (const missed of [{ type: 'object', properties: { pdf: { allOf: [{ 'x-file': true }] } } }, { type: 'object', anyOf: [{ properties: { pdf: { 'x-file': true } } }] }]) {
      expect(fileProperties(missed)).toEqual([])
      expect(manifestProblems({ ...manifest, output: missed }).map((problem) => problem.field)).toHaveLength(1)
    }
  })
})
