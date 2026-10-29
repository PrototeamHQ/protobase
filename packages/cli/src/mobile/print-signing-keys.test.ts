import { createPublicKey, sign, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readSigningKey } from '@protobase/server/mobile-release'
import { printSigningKeys } from './print-signing-keys'
import { updaterPublicKey } from './public-key'

const printed = () => {
  const out: string[] = []
  const notes: string[] = []
  printSigningKeys((text) => void out.push(text), (text) => void notes.push(text))
  const [line, publicKey] = out.join('').split('\n\n')
  return { line: line!, publicKey: publicKey!, notes: notes.join('') }
}

describe('printSigningKeys', () => {
  it('prints a signing key the server reads and the public key that verifies it, which mobile.publicKey takes', () => {
    const { line, publicKey } = printed()
    const [name, value] = [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]
    expect(name).toBe('PROTOBASE_MOBILE_SIGNING_KEY')
    expect(value).not.toContain('\n')
    const key = readSigningKey({ [name]: value })!
    const signature = sign('sha256', Buffer.from('release'), key)
    expect(verify('sha256', Buffer.from('release'), createPublicKey(publicKey), signature)).toBe(true)
    expect(() => updaterPublicKey(publicKey)).not.toThrow()
  })

  it('prints the signing key only on out, and a fresh pair each time', () => {
    const one = printed()
    expect(one.notes).not.toContain('PRIVATE KEY')
    expect(one.notes).toContain('never committed')
    expect(printed().line).not.toBe(one.line)
  })
})
