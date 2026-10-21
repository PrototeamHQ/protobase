import type { ResourceModel } from '@protobase/schema'
import { encryptionKeyring, type Keyring } from './keyring'
import { sharedColumnProblems } from './shared-columns'

/** The keys encrypted fields are sealed and opened with, when a resource has one. */
export type EncryptionRuntime = { keyring: Keyring }

export type EncryptionRuntimeInput = { models: readonly ResourceModel[]; env: Record<string, string | undefined> }

const encryptedFieldNames = (models: readonly ResourceModel[]) =>
  models.flatMap((model) => Object.values(model.fields).flatMap((field) => (field.encrypted ? [`${model.name}.${field.name}`] : [])))

/**
 * The runtime, when a resource has an encrypted field. It fails at startup when another resource over the same column
 * would write plaintext into it or bind it differently, or when the key is missing or unfit. It needs no database.
 */
export const createEncryptionRuntime = ({ models, env }: EncryptionRuntimeInput): EncryptionRuntime | undefined => {
  const fields = encryptedFieldNames(models)
  if (fields.length === 0) return undefined
  const problems = sharedColumnProblems(models)
  if (problems.length > 0) throw new Error(problems.join('; '))
  if (!env.PROTOBASE_ENCRYPTION_KEY?.trim()) {
    throw new Error(`Encrypted fields (${fields.join(', ')}) need a key: set PROTOBASE_ENCRYPTION_KEY to 32 random bytes in base64, such as the output of openssl rand -base64 32`)
  }
  return { keyring: encryptionKeyring(env) }
}
