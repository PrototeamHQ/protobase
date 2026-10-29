import { encodeKey } from '@protobase/schema/internal'
import { toolKey } from '../assistant/records'
import type { Deps } from '../deps'
import type { CallsService } from './calls-service-type'
import type { CallsOptions } from './calls-options'
import type { CallsRuntime } from './calls-runtime'

/** An app's calls over its resources: the runtime loaded at the first use, so an app that never calls loads none of it. */
export const callsService = (deps: () => Deps, options: CallsOptions): CallsService => {
  let runtime: Promise<CallsRuntime> | undefined
  return {
    runtime: () =>
      (runtime ??= import('./calls-runtime').then(({ callsRuntime }) => {
        const { db, statementTimeoutMs, report } = deps()
        return callsRuntime({ db, timeoutMs: statementTimeoutMs, options, report })
      })),
    recordOf: (resource, key) => {
      const found = toolKey(deps(), resource, key)
      return { resource: found.entry.name, key: encodeKey(found.key) }
    },
  }
}
