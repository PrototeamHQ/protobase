import { describe, expect, it } from 'vitest'
import { loginLine, protobaseCommand } from './login-line'

describe('protobaseCommand', () => {
  it("runs the project's protobase with the package manager that started dev, npx otherwise", () => {
    expect(protobaseCommand('bun/1.4.2 npm/? node/v24.3.0 darwin arm64')).toBe('bun run protobase')
    expect(protobaseCommand('npm/10.9.2 node/v22.12.0 darwin arm64 workspaces/false')).toBe('npx protobase')
    expect(protobaseCommand('pnpm/9.15.0 npm/? node/v22.12.0 linux x64')).toBe('pnpm protobase')
    expect(protobaseCommand(undefined)).toBe('npx protobase')
  })
})

describe('loginLine', () => {
  it('gives the exact command that creates the first admin while there are no users', () => {
    expect(loginLine(false, 'bun/1.4.2')).toBe('  login    no users yet; create the first admin with:\n             bun run protobase users create you@example.com --generate-password\n')
  })

  it('points at the existing users, and at adding one, once there are users', () => {
    expect(loginLine(true, undefined)).toBe('  login    sign in as one of its users (`npx protobase users list`), or add one: npx protobase users create you@example.com --generate-password\n')
  })

  it('says nothing without an auth store the users commands manage', () => {
    expect(loginLine(undefined, 'bun/1.4.2')).toBe('')
  })
})
