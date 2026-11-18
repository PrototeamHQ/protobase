import { describe, expect, it } from 'vitest'
import { personalAccessTokenSchema, personalAccessTokenTables } from './personal-access-tokens/token-store'
import { signInPolicySchema, signInPolicyTables } from './policy-store'
import { staffSignInSchema, staffSignInTables } from './staff-log'

describe("Protobase's own sign-in tables", () => {
  it('keep their names without a schema option', () => {
    expect(signInPolicyTables()).toEqual(signInPolicySchema)
    expect(staffSignInTables({})).toEqual(staffSignInSchema)
    expect(personalAccessTokenTables()).toEqual(personalAccessTokenSchema)
    expect(signInPolicyTables().signInPolicy.modelName).toBe('sign_in_policy')
    expect(staffSignInTables().staffSignIn.fields.sessionId.fieldName).toBe('session_id')
    expect(personalAccessTokenTables().personalAccessToken.fields.tokenHash.fieldName).toBe('token_hash')
  })

  it('take the names a schema option gives, keeping the rest', () => {
    const tables = signInPolicyTables({ signInPolicy: { modelName: 'login_rules', fields: { emailCode: 'mail_code', password: 'pw' } } })
    expect(tables.signInPolicy.modelName).toBe('login_rules')
    expect(tables.signInPolicy.fields.emailCode).toEqual({ type: 'string', required: true, fieldName: 'mail_code' })
    expect(tables.signInPolicy.fields.password).toEqual({ type: 'string', required: true, fieldName: 'pw' })
    expect(tables.signInPolicy.fields.twoFactor.fieldName).toBe('two_factor')

    expect(staffSignInTables({ staffSignIn: { modelName: 'support_log' } }).staffSignIn.modelName).toBe('support_log')
    expect(personalAccessTokenTables({ personalAccessToken: { fields: { userId: 'owner' } } }).personalAccessToken.fields.userId.fieldName).toBe('owner')
  })

  it("leave the defaults as they are for the next plugin, though Better Auth's merge writes into what it is given", () => {
    signInPolicyTables({ signInPolicy: { modelName: 'login_rules', fields: { emailCode: 'mail_code' } } })
    expect(signInPolicySchema.signInPolicy.modelName).toBe('sign_in_policy')
    expect(signInPolicySchema.signInPolicy.fields.emailCode.fieldName).toBe('email_code')
    expect(signInPolicyTables().signInPolicy.modelName).toBe('sign_in_policy')
  })
})
