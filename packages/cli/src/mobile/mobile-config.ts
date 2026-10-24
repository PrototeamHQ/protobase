import type { MobileConfig } from '@protobase/server'
import { packageNameProblem } from './package-name'
import { pinnedProblem } from './pinned-packages'

export const noMobileSection = "This project has no mobile section: add `mobile: { appId: 'com.example.app' }` to the default export of protobase.config.ts"

// Capacitor's own rule for an app id (@capacitor/cli, common.js), applied to the lower-cased id.
const appIdPattern = /^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/

// Plugin specs fetched over a transport anyone on the network path could swap the code on.
const unauthenticated = /^(?:http:|git:|git\+http:)/i

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The project's `mobile` section, checked: an error says what to add or fix. */
export const checkMobileConfig = (value: unknown): MobileConfig => {
  if (value === undefined) throw new Error(noMobileSection)
  if (!isRecord(value)) throw new Error('mobile in protobase.config.ts must be an object such as { appId: \'com.example.app\' }')
  const { appId, plugins } = value
  if (typeof appId !== 'string' || !appIdPattern.test(appId.toLowerCase())) {
    throw new Error(`mobile.appId must be a reverse-DNS id such as com.example.app: at least two parts separated by dots, each starting with a letter and holding only letters, digits and underscores, not ${JSON.stringify(appId)}`)
  }
  if (plugins === undefined) return { appId }
  if (!isRecord(plugins) || Object.values(plugins).some((spec) => typeof spec !== 'string')) {
    throw new Error("mobile.plugins must map each plugin's npm name to a version range, such as { '@capacitor/camera': '^8.0.0' }")
  }
  for (const [name, spec] of Object.entries(plugins as Record<string, string>)) {
    const problem = packageNameProblem(name) ?? pinnedProblem(name)
    if (problem) throw new Error(problem)
    if (unauthenticated.test(spec)) throw new Error(`mobile.plugins installs ${name} from ${spec}, over a connection that is not secure: use a version range, https or git+https`)
  }
  return { appId, plugins: plugins as Record<string, string> }
}
