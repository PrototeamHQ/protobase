import { describe, expect, it } from 'vitest'
import { createSigner } from '../files/signer'
import { readGrant, signGrant } from './storage-token'

const signer = createSigner('storage-token-test-secret')
const object = { bucket: 'docs', name: 'user-1/report.pdf' }
const now = Date.UTC(2026, 7, 1)
const expires = now / 1000 + 60

describe('signGrant and readGrant', () => {
  it('read back the grant of a token for the same object and purpose', async () => {
    const token = await signGrant(signer, 'storage-download', { ...object, expires })
    expect(token).toMatch(/^[\w-]+\.[\w-]{43}$/)
    expect(await readGrant(signer, 'storage-download', token, object, now)).toEqual({ ...object, expires })
    const upload = { ...object, owner: 'user-1', upsert: true, expires }
    expect(await readGrant(signer, 'storage-upload', await signGrant(signer, 'storage-upload', upload), object, now)).toEqual(upload)
  })

  it('refuse another object, another purpose, a changed grant or garbage', async () => {
    const token = await signGrant(signer, 'storage-download', { ...object, expires })
    await expect(readGrant(signer, 'storage-download', token, { ...object, name: 'user-2/report.pdf' }, now)).rejects.toThrow('Invalid signature')
    await expect(readGrant(signer, 'storage-upload', token, object, now)).rejects.toThrow('Invalid signature')
    const changed = `${Buffer.from(JSON.stringify({ ...object, expires: expires + 3600 })).toString('base64url')}.${token.split('.')[1]}`
    await expect(readGrant(signer, 'storage-download', changed, object, now)).rejects.toThrow('Invalid signature')
    await expect(readGrant(signer, 'storage-download', 'not-a-token', object, now)).rejects.toThrow('Invalid signature')
  })

  it('refuse an expired token', async () => {
    const token = await signGrant(signer, 'storage-download', { ...object, expires })
    await expect(readGrant(signer, 'storage-download', token, object, (expires + 1) * 1000)).rejects.toThrow('The provided token has expired.')
  })
})
