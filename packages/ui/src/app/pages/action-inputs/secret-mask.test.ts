import { describe, expect, it } from 'vitest'
import { ApiError } from '@protobase/client'
import type { ActionInputModel } from '@protobase/schema'
import { ActionInputError, inputErrors } from './input-errors'
import { maskSecrets, maskedFailure, maskedMessages, secretAnswers } from './secret-mask'

const inputs: ActionInputModel[] = [
  { name: 'label', kind: 'text', label: 'Label', required: true },
  { name: 'api_key', kind: 'secret', label: 'API key', required: true },
]

describe('secret masking', () => {
  const secrets = secretAnswers(inputs, { label: 'Main', api_key: 'sk-"live"-42' })

  it('takes only the answers of secret inputs', () => {
    expect(secrets).toEqual(['sk-"live"-42'])
    expect(secretAnswers(inputs, { label: 'Main', api_key: null })).toEqual([])
  })

  it('masks a secret a handler echoes in its error, its input messages and an API problem', () => {
    const plain = maskedFailure(new Error('Key sk-"live"-42 was refused'), secrets) as Error
    expect(plain.message).toBe('Key •••••• was refused')
    const refusal = new ActionInputError({ api_key: 'sk-"live"-42 is no key' })
    expect(maskedMessages(inputErrors(refusal, inputs), secrets)).toEqual({ api_key: '•••••• is no key' })
    const api = maskedFailure(new ApiError({ type: 'urn:protobase:problem:invalid', title: 'Invalid', status: 400, detail: 'Bad key sk-"live"-42' }), secrets)
    expect(api).toBeInstanceOf(ApiError)
    expect((api as ApiError).message).toBe('Bad key ••••••')
  })

  it('masks a longer secret whole when a shorter one is part of it', () => {
    expect(maskSecrets('x=abcdef1234', ['abc', 'abcdef1234'])).toBe('x=••••••')
  })

  it('leaves a failure as it is when no secret was answered', () => {
    const error = new Error('Main is taken')
    expect(maskedFailure(error, [])).toBe(error)
  })
})
