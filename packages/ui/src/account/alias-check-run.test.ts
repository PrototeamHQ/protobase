import { describe, expect, it, vi } from 'vitest'
import type { MailSenderCheck } from '@protobase/client'
import { checkAttempts, checkInterval, runAliasCheck, type AliasCheckState } from './alias-check-run'

const waiting: MailSenderCheck = { status: 'waiting', check: 'token-1' }

const run = (started: MailSenderCheck, answers: MailSenderCheck[], stopAfter = Infinity) => {
  const states: AliasCheckState[] = []
  const result = vi.fn(async (_check: string) => answers.shift() ?? waiting)
  const wait = vi.fn(async (_ms: number) => {})
  const done = runAliasCheck({ start: async () => started, result, wait, stopped: () => result.mock.calls.length >= stopAfter, onState: (state) => states.push(state) })
  return { states, result, wait, done }
}

describe('a From address check', () => {
  it('waits for its test message, asking every interval, and confirms the From it arrived with', async () => {
    const { states, result, wait, done } = run(waiting, [waiting, { status: 'confirmed', from: 'billing@shop.example' }])
    await done
    expect(states).toEqual([{ status: 'waiting' }, { status: 'confirmed', from: 'billing@shop.example' }])
    expect(result).toHaveBeenCalledWith('token-1')
    expect(result).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(checkInterval)
  })

  it('names the address the message came from instead', async () => {
    const { states, done } = run(waiting, [{ status: 'mismatch', from: 'ana@gmail.example' }])
    await done
    expect(states.at(-1)).toEqual({ status: 'mismatch', from: 'ana@gmail.example' })
  })

  it('gives up after its last attempt', async () => {
    const { states, result, done } = run(waiting, [])
    await done
    expect(result).toHaveBeenCalledTimes(checkAttempts)
    expect(states).toEqual([{ status: 'waiting' }, { status: 'timed_out' }])
  })

  it('says the address stays unchecked where the app cannot check, asking nothing more', async () => {
    const { states, result, done } = run({ status: 'unchecked' }, [])
    await done
    expect(states).toEqual([{ status: 'waiting' }, { status: 'unchecked' }])
    expect(result).not.toHaveBeenCalled()
  })

  it('stops, reporting nothing more, once it is left', async () => {
    const { states, result, done } = run(waiting, [], 1)
    await done
    expect(result).toHaveBeenCalledTimes(1)
    expect(states).toEqual([{ status: 'waiting' }])
  })
})
