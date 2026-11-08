import { newCredential, workspaceOrigin, type RelayStore } from '@protobase/server'

type Out = (text: string) => void

/**
 * Adds a credential bound to the workspace `origin`, keeping only its hash, and prints it once on `out`: the value the
 * workspace sets as its relay credential. Its id, which removes it, goes to `note`.
 */
export const addCredentialCommand = async (store: RelayStore, given: string, out: Out, note: Out) => {
  const origin = workspaceOrigin(given)
  if (!origin) throw new Error('The workspace origin is not an https origin, such as https://app.example.com, with no path')
  const { text, stored } = newCredential(origin)
  await store.addCredential(stored)
  out(`${text}\n`)
  note(`Credential ${stored.id} sends to the phones registered for ${origin}. Set it as the workspace's PROTOBASE_PUSH_RELAY_CREDENTIAL; it is not shown again.\n`)
}

/** Prints each credential's id, origin and creation time, never anything of its secret. */
export const listCredentialsCommand = async (store: RelayStore, out: Out) => {
  for (const credential of await store.listCredentials()) out(`${credential.id}  ${credential.origin}  ${credential.createdAt.toISOString()}\n`)
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Removes the credential `id`, after which its sends are refused; an unknown id is an error. */
export const removeCredentialCommand = async (store: RelayStore, id: string, out: Out) => {
  if (!uuid.test(id) || !(await store.removeCredential(id))) throw new Error(`There is no credential ${id}`)
  out(`Removed credential ${id}\n`)
}
