import { readRelaySettings, type RelayStore } from '@protobase/server'
import { describe, expect, it } from 'vitest'
import { addCredentialCommand, listCredentialsCommand, removeCredentialCommand } from './credentials'

// Only the credential methods the commands call.
const credentialStore = () => {
  const kept = new Map<string, { id: string; origin: string; secretHash: Buffer; createdAt: Date }>()
  const store = {
    addCredential: async (credential) => void kept.set(credential.id, { ...credential, createdAt: new Date(0) }),
    listCredentials: async () => [...kept.values()].map(({ id, origin, createdAt }) => ({ id, origin, createdAt })),
    removeCredential: async (id) => kept.delete(id),
  } as RelayStore
  return { store, kept }
}

const printed = () => {
  let text = ''
  return { out: (more: string) => void (text += more), text: () => text }
}

describe('the push-relay credential commands', () => {
  it('add prints a credential once, which the relay sender takes, keeps only its hash, and notes its id apart', async () => {
    const { store, kept } = credentialStore()
    const out = printed()
    const note = printed()
    await addCredentialCommand(store, 'https://a.example.com', out.out, note.out)
    const credential = out.text().trim()
    expect(readRelaySettings({ PROTOBASE_PUSH_RELAY_URL: 'https://relay.example.com', PROTOBASE_PUSH_RELAY_CREDENTIAL: credential })?.credential).toBe(credential)
    const [stored] = [...kept.values()]
    expect(stored!.origin).toBe('https://a.example.com')
    expect(JSON.stringify(stored)).not.toContain(credential.split('.')[1])
    expect(note.text()).toContain(stored!.id)
    expect(note.text()).not.toContain(credential)
  })

  it('add refuses an origin that is not an https origin, adding nothing', async () => {
    const { store, kept } = credentialStore()
    for (const origin of ['http://a.example.com', 'https://a.example.com/path', 'a.example.com']) {
      await expect(addCredentialCommand(store, origin, () => {}, () => {})).rejects.toThrow('not an https origin')
    }
    expect(kept.size).toBe(0)
  })

  it('list prints ids and origins only, and remove removes one by id or fails for an unknown one', async () => {
    const { store } = credentialStore()
    const secret = printed()
    await addCredentialCommand(store, 'https://a.example.com', secret.out, () => {})
    const listed = printed()
    await listCredentialsCommand(store, listed.out)
    const [id, origin] = listed.text().trim().split(/\s+/)
    expect(origin).toBe('https://a.example.com')
    expect(listed.text()).not.toContain(secret.text().trim().split('.')[1])
    await expect(removeCredentialCommand(store, '00000000-0000-4000-8000-000000000000', () => {})).rejects.toThrow('There is no credential')
    await expect(removeCredentialCommand(store, 'not-an-id', () => {})).rejects.toThrow('There is no credential')
    const removed = printed()
    await removeCredentialCommand(store, id!, removed.out)
    expect(removed.text()).toBe(`Removed credential ${id}\n`)
    const after = printed()
    await listCredentialsCommand(store, after.out)
    expect(after.text()).toBe('')
  })
})
