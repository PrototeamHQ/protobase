import { afterEach, describe, expect, it } from 'vitest'
import { ApiError, type ProblemError } from '@protobase/client'
import type { FieldModel } from '@protobase/schema'
import { setAppLocale } from '../locale/active-locale'
import { fieldErrors, fieldMessage, saveFailureDescription } from './field-errors'

const field = (type: FieldModel['type']): FieldModel => ({ name: 'x', column: 'x', type, nullable: false, readOnly: false, filterable: false, sortable: false, aliases: [] })

const invalid = (params?: Record<string, unknown>) => ({ field: 'x', code: 'invalid-value', message: 'Expected something', ...(params && { params }) })

const problem = (errors: ProblemError[], operation?: number) =>
  new ApiError({ type: 'urn:protobase:problem:invalid-record', title: 'Bad Request', status: 400, detail: 'The request body is invalid: x: Expected something', errors, ...(operation !== undefined && { operation }) })

afterEach(() => setAppLocale(undefined))

describe('fieldMessage', () => {
  it('words it in Dutch in a Dutch app, with Dutch numbers', () => {
    setAppLocale('nl')
    expect(fieldMessage(field('decimal'), 'Prijs', invalid({ precision: 12, scale: 2 }))).toBe('Vul een getal in met hoogstens 2 decimalen, onder 10.000.000.000')
    expect(fieldMessage(field('text'), 'Code', invalid({ min: 1 }))).toBe('Code moet minstens 1 teken hebben')
  })

  it('names the label of a field left empty', () => {
    expect(fieldMessage(field('country'), 'Country', { field: 'country_code', code: 'required', message: '"country_code" is required' })).toBe('Country is required')
  })

  it('words a decimal by its places and size', () => {
    expect(fieldMessage(field('decimal'), 'Price', invalid({ precision: 12, scale: 2 }))).toBe('Enter a number with at most 2 decimals, below 10,000,000,000')
    expect(fieldMessage(field('decimal'), 'Price', invalid({ precision: 5, scale: 0 }))).toBe('Enter a whole number below 100,000')
    expect(fieldMessage(field('decimal'), 'Price', invalid())).toBe('Enter a number')
  })

  it('words a text or a whole number by the limit it broke', () => {
    expect(fieldMessage(field('text'), 'Name', invalid({ max: 200 }))).toBe('Name can have at most 200 characters')
    expect(fieldMessage(field('text'), 'Code', invalid({ min: 1 }))).toBe('Code needs at least 1 character')
    expect(fieldMessage(field('integer'), 'Rooms', invalid({ min: 0 }))).toBe('Enter a whole number of at least 0')
    expect(fieldMessage(field('integer'), 'Rooms', invalid())).toBe('Enter a whole number')
  })

  it("keeps the project's own words: a pattern's, a rule's, and a type without an entry", () => {
    expect(fieldMessage(field('text'), 'Code', invalid())).toBe('Expected something')
    expect(fieldMessage(field('text'), 'Name', { field: 'x', code: 'invalid-record', message: 'That name is not allowed' })).toBe('That name is not allowed')
    expect(fieldMessage(field('file'), 'Photo', invalid())).toBe('Expected something')
    expect(fieldMessage(undefined, 'Photo', invalid())).toBe('Expected something')
  })
})

describe('fieldErrors', () => {
  it('keeps the first problem of each field and leaves out rules about the whole record', () => {
    const error = problem([invalid({ max: 2 }), { ...invalid(), message: 'second' }, { field: '_record', code: 'invalid-record', message: 'Ends before it starts' }])
    expect(fieldErrors(error)).toEqual({ x: invalid({ max: 2 }) })
    expect(fieldErrors(new Error('offline'))).toEqual({})
  })
})

describe('saveFailureDescription', () => {
  it('counts the fields to check, with the messages of rules about the whole record', () => {
    expect(saveFailureDescription(problem([invalid(), { field: 'y', code: 'required', message: '' }, { field: 'y', code: 'invalid-value', message: '' }]))).toBe('Check 2 fields.')
    expect(saveFailureDescription(problem([invalid()]))).toBe('Check the marked field.')
    expect(saveFailureDescription(problem([invalid(), { field: '_record', code: 'invalid-record', message: 'Ends before it starts.' }]))).toBe('Check the marked field. Ends before it starts.')
  })

  it("keeps the error's message without field problems, and for a batch", () => {
    expect(saveFailureDescription(problem([]))).toBe('The request body is invalid: x: Expected something')
    expect(saveFailureDescription(problem([invalid()], 1))).toBe('The request body is invalid: x: Expected something')
  })
})
