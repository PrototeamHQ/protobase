import { afterEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])

vi.mock('./dev/env', () => ({ loadNearestEnvFile: () => calls.push('env') }))
vi.mock('./doctor/run-without-database', () => ({
  runDoctorWithoutDatabase: async () => {
    calls.push('doctor')
    return { errors: 0 }
  },
}))

const { program } = await import('./main')

describe('protobase doctor --without-database', () => {
  afterEach(() => {
    calls.length = 0
  })

  it("loads the project's .env before checking, so config that reads it sees its values", async () => {
    await program.parseAsync(['node', 'protobase', 'doctor', '--without-database'])
    expect(calls).toEqual(['env', 'doctor'])
  })
})
