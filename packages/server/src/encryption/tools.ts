import type { Db } from '@protobase/query'
import type { EventsOptions } from '../changes/events-options'
import { changesSchema } from '../changes/events-options'
import { buildRegistry } from '../registry'
import type { ResourceSource } from '../resource-source'
import { applyEncryption, type ApplyOptions } from './apply'
import { rebindProblem } from './rebind-check'
import { createEncryptionRuntime } from './runtime'
import { encryptionStatus } from './status'

export type EncryptionToolsInput = { resources: ResourceSource[]; db: Db; events?: EventsOptions; env: Record<string, string | undefined> }

/**
 * What `protobase encryption status` and `apply` run on a project: `undefined` when it has no encrypted fields. It fails
 * on the same config and key problems as the server's startup. `kid` is the id of the current key.
 */
export const createEncryptionTools = ({ resources, db, events, env }: EncryptionToolsInput) => {
  const { entries } = buildRegistry(resources)
  const runtime = createEncryptionRuntime({ models: entries.map((entry) => entry.model), env })
  if (!runtime) return undefined
  const { keyring } = runtime
  const schema = changesSchema(events)
  return {
    kid: keyring.current.id,
    /** What every encrypted field's column holds, and what remains of its plaintext; it writes nothing. */
    status: () => encryptionStatus(db, entries, keyring, schema),
    /** Encrypts the plaintext, moves previous keys' values to the current one, rebinds renamed ones, and scrubs remnants. */
    apply: async (options: ApplyOptions = {}) => {
      const problem = options.rebind && rebindProblem(entries, options.rebind)
      if (problem) throw new Error(problem)
      return applyEncryption(db, entries, keyring, schema, options)
    },
  }
}

/** The tools of a project with encrypted fields. */
export type EncryptionTools = NonNullable<ReturnType<typeof createEncryptionTools>>
