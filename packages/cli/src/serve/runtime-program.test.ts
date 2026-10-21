import { describe, expect, it, vi } from 'vitest'
import { runtimeProgram } from './runtime-program'

const parse = async (...args: string[]) => {
  const actions = { serve: vi.fn(async () => {}), migrate: vi.fn(async () => {}), createAdmin: vi.fn(async () => {}) }
  const program = runtimeProgram(actions)
    .exitOverride()
    .configureOutput({ writeErr: () => {}, writeOut: () => {} })
  for (const command of program.commands) command.exitOverride().configureOutput({ writeErr: () => {}, writeOut: () => {} })
  const result = await program.parseAsync(args, { from: 'user' }).then(
    () => undefined,
    (error: Error) => error,
  )
  return { actions, error: result }
}

describe('runtimeProgram', () => {
  it('serves a bundle given alone, as hosts run the runtime, or after serve', async () => {
    for (const args of [['/app/protobase.config.js'], ['serve', '/app']]) {
      const { actions, error } = await parse(...args)
      expect(error).toBeUndefined()
      expect(actions.serve).toHaveBeenCalledWith(args.at(-1))
    }
  })

  it('migrates a bundle', async () => {
    const { actions } = await parse('migrate', '/app')
    expect(actions.migrate).toHaveBeenCalledWith('/app')
    expect(actions.serve).not.toHaveBeenCalled()
  })

  it('creates an admin from a bundle, an email and the password options', async () => {
    const { actions } = await parse('create-admin', '/app', 'a@b.c', '--generate-password')
    expect(actions.createAdmin).toHaveBeenCalledWith('/app', 'a@b.c', { passwordStdin: false, generatePassword: true })
    const named = await parse('create-admin', '/app', 'a@b.c', '--password-stdin', '--name', 'Ann')
    expect(named.actions.createAdmin).toHaveBeenCalledWith('/app', 'a@b.c', { name: 'Ann', passwordStdin: true, generatePassword: false })
  })

  it('refuses a password argument before any action runs, never repeating it', async () => {
    for (const args of [
      ['create-admin', '/app', 'a@b.c', '--password', 'hunter2'],
      ['create-admin', '/app', 'a@b.c', '--password=hunter2'],
      ['create-admin', '/app', '--password', 'hunter2', 'a@b.c'],
    ]) {
      const { actions, error } = await parse(...args)
      expect(error?.message).toContain('Passwords are never accepted as arguments')
      expect(error?.message).not.toContain('hunter2')
      expect(actions.createAdmin).not.toHaveBeenCalled()
    }
  })
})
