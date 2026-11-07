import { describe, expect, it } from 'vitest'
import { apnsResult } from './answer'

describe('apnsResult', () => {
  it('takes 200 as delivered', () => {
    expect(apnsResult({ status: 200 })).toEqual({ result: 'ok' })
  })

  it('takes 410 and 400 BadDeviceToken as gone', () => {
    expect(apnsResult({ status: 410, reason: 'Unregistered' })).toEqual({ result: 'gone' })
    expect(apnsResult({ status: 410, reason: 'ExpiredToken' })).toEqual({ result: 'gone' })
    expect(apnsResult({ status: 400, reason: 'BadDeviceToken' })).toEqual({ result: 'gone' })
  })

  it.each(['BadTopic', 'MissingTopic', 'PayloadEmpty', 'DeviceTokenNotForTopic', 'TopicDisallowed', 'BadDeviceTokenX', undefined])('never removes a device on a 400 %s', (reason) => {
    expect(apnsResult({ status: 400, ...(reason && { reason }) })).toEqual({ result: 'retry' })
  })

  it.each([
    [403, 'InvalidProviderToken'],
    [403, 'ExpiredProviderToken'],
    [404, 'BadPath'],
    [405, 'MethodNotAllowed'],
    [413, 'PayloadTooLarge'],
    [301, undefined],
  ])('asks to retry a %i %s, neither delivered nor gone', (status, reason) => {
    expect(apnsResult({ status, ...(reason && { reason }) })).toEqual({ result: 'retry' })
  })

  it('asks to retry 429, 5xx and no answer, after retry-after when given in seconds', () => {
    expect(apnsResult({ status: 429, reason: 'TooManyRequests' })).toEqual({ result: 'retry' })
    expect(apnsResult({ status: 500, reason: 'InternalServerError' })).toEqual({ result: 'retry' })
    expect(apnsResult({ status: 503, reason: 'ServiceUnavailable', retryAfter: '120' })).toEqual({ result: 'retry', retryAfterSeconds: 120 })
    expect(apnsResult({ status: 503, retryAfter: 'Wed, 21 Oct 2015 07:28:00 GMT' })).toEqual({ result: 'retry' })
    expect(apnsResult(undefined)).toEqual({ result: 'retry' })
  })
})
