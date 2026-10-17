import { describe, expect, it } from 'vitest'
import { ApiError } from '@protobase/client'
import type { ActionInputModel } from '@protobase/schema'
import { ActionInputError, inputErrors } from './input-errors'

const inputs: ActionInputModel[] = [
  { name: 'email', kind: 'text', label: 'Email', required: true },
  { name: 'reason', kind: 'text', label: 'Reason', required: true },
]

describe('inputErrors', () => {
  it("takes an ActionInputError's messages for the inputs it names", () => {
    expect(inputErrors(new ActionInputError({ email: 'No user has this address', other: 'x' }), inputs)).toEqual({ email: 'No user has this address' })
  })

  it("takes an API error's messages whose field is an input's name", () => {
    const error = new ApiError({ type: 'urn:protobase:problem:invalid', title: 'Invalid', status: 400, errors: [{ field: 'reason', message: 'Too short' }, { message: 'No field' }, { field: 'plan', message: 'Unknown' }] })
    expect(inputErrors(error, inputs)).toEqual({ reason: 'Too short' })
  })

  it('takes nothing from another failure', () => {
    expect(inputErrors(new Error('Network down'), inputs)).toEqual({})
  })
})
