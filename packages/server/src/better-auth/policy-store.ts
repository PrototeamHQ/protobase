import type { DBAdapter } from 'better-auth'
import { defaultSignInPolicy, parseSignInPolicy, type SignInPolicy } from './sign-in-policy'

/** Better Auth's model for the sign-in policy: one row per save, the newest applies, the older ones are its history. */
export const signInPolicyModel = 'signInPolicy'

export const signInPolicySchema = {
  [signInPolicyModel]: {
    modelName: 'sign_in_policy',
    fields: {
      password: { type: 'string', required: true },
      emailCode: { type: 'string', required: true, fieldName: 'email_code' },
      passkey: { type: 'string', required: true },
      twoFactor: { type: 'string', required: true, fieldName: 'two_factor' },
      // Rows saved before staff sign-in existed get the default when the migration adds the column.
      staffAccess: { type: 'string', required: true, defaultValue: 'allowed', fieldName: 'staff_access' },
      // Likewise for rows saved before sign-in through the platform existed.
      platformSignIn: { type: 'string', required: true, defaultValue: 'allowed', fieldName: 'platform_sign_in' },
      createdAt: { type: 'date', required: true, fieldName: 'created_at' },
      createdBy: { type: 'string', required: false, fieldName: 'created_by' },
    },
  },
} as const

type PolicyRow = SignInPolicy & { id: string; createdAt: Date; createdBy?: string | null }

export type StoredSignInPolicy = { policy: SignInPolicy; savedAt?: string; savedBy?: string }

/** The newest saved policy, or the default when none was saved. A row that no longer parses counts as none. */
export const readSignInPolicy = async (adapter: Pick<DBAdapter, 'findMany'>): Promise<StoredSignInPolicy> => {
  const [row] = await adapter.findMany<PolicyRow>({ model: signInPolicyModel, sortBy: { field: 'createdAt', direction: 'desc' }, limit: 1 })
  const policy = row && parseSignInPolicy(row)
  if (!policy) return { policy: defaultSignInPolicy }
  return { policy, savedAt: new Date(row.createdAt).toISOString(), ...(row.createdBy && { savedBy: row.createdBy }) }
}

export const saveSignInPolicy = async (adapter: Pick<DBAdapter, 'create'>, policy: SignInPolicy, savedBy: string) => {
  await adapter.create({ model: signInPolicyModel, data: { ...policy, createdAt: new Date(), createdBy: savedBy } })
}
