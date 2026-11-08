import type { ConnectionDeclaration } from '@protobase/workflows/plugin'

/**
 * The Better Auth provider id a connection's accounts are kept under: the app's sign-in provider it names, or one of
 * its own, `workflow-<plugin>-<connection>`, for an `oauth` connection; plugin and connection names hold no `-`.
 */
export const connectionProviderId = (plugin: string, name: string, declaration: ConnectionDeclaration) => ('signIn' in declaration ? declaration.signIn : `workflow-${plugin}-${name}`)

/** Whether an account's stored scopes hold every scope the connection asks for. */
export const holdsScopes = (stored: readonly string[], declaration: ConnectionDeclaration) => (declaration.scopes ?? []).every((scope) => stored.includes(scope))
