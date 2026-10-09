export { createAdmin, type CreateAdminInput } from './create-admin'
export { configExports } from './resource-source'
export type { ResourceSource } from './resource-source'
export type { AuditEvent, AuditQueue } from './types'
export { consoleAuditQueue } from './audit/console-queue'
export { jwtAuthenticator, type JwtOptions } from './auth/jwt'
export { HttpProblem, unauthorized, forbidden, notFound, badRequest } from './problem'
export type {
  Admin,
  AdminOptions,
  Authenticator,
  PipelineHook,
  ScanGuardMode,
  Session,
  TenantValue,
  User,
  ViewSource,
  WriteEvent,
  WriteOperation,
} from './types'
export { createAuth, normalizeRoles, type AdminAuth, type CreateAuthOptions, type UserCreatedHook } from './better-auth/create-auth'
export { betterAuthAuthenticator, type BetterAuthAuthenticatorOptions } from './better-auth/authenticator'
export { roleChoices, parseRoles, hasUsers, createUser, listUsers, deleteUser, setUserRole, setUserBanned, type NewUser, type StoredUser } from './better-auth/users'
export { issueToken, maxTokenTtlSeconds, type IssueTokenOptions } from './better-auth/tokens'
