import { describe, expect, it } from 'vitest'
import { isRefusedForStaff, isStaffSession, isStrongSignIn, reasonProblem, staffClaimsRefusal, staffLabel, staffSignInMaxAgeSeconds, type StaffClaims } from './staff-checks'

const now = 1_800_000_000
const options = { group: 'protobase-staff-access', acrValues: [], now }
const staff = (changes: Partial<StaffClaims> = {}): StaffClaims => ({ sub: 'staff-1', email: 'alex@operator.example', groups: ['support', 'protobase-staff-access'], amr: ['pwd', 'mfa'], auth_time: now - 60, ...changes })
const code = (claims: StaffClaims, given = options) => staffClaimsRefusal(claims, given)?.code

describe('staffClaimsRefusal', () => {
  it('lets a strongly and recently signed-in staff member with the permission through', () => {
    expect(staffClaimsRefusal(staff(), options)).toBeUndefined()
  })

  it('needs the explicit permission: the configured group, as a list or a space separated string', () => {
    expect(code(staff({ groups: ['support'] }))).toBe('STAFF_PERMISSION_MISSING')
    expect(code(staff({ groups: undefined }))).toBe('STAFF_PERMISSION_MISSING')
    expect(code(staff({ groups: 'protobase-staff-access-old' }))).toBe('STAFF_PERMISSION_MISSING')
    expect(code(staff({ groups: 'support protobase-staff-access' }))).toBeUndefined()
    expect(code(staff(), { ...options, group: 'other' })).toBe('STAFF_PERMISSION_MISSING')
  })

  it('needs a strong sign-in at the operator provider', () => {
    expect(code(staff({ amr: ['pwd'] }))).toBe('STAFF_SIGN_IN_NOT_STRONG')
    expect(code(staff({ amr: ['otp'] }))).toBe('STAFF_SIGN_IN_NOT_STRONG')
    expect(code(staff({ amr: undefined }))).toBe('STAFF_SIGN_IN_NOT_STRONG')
    expect(code(staff({ amr: ['hwk'] }))).toBeUndefined()
  })

  it('needs a sign-in from the last 15 minutes', () => {
    expect(code(staff({ auth_time: now - staffSignInMaxAgeSeconds - 1 }))).toBe('STAFF_SIGN_IN_STALE')
    expect(code(staff({ auth_time: undefined }))).toBe('STAFF_SIGN_IN_STALE')
    expect(code(staff({ auth_time: now - staffSignInMaxAgeSeconds }))).toBeUndefined()
  })

  it('checks the permission before anything else', () => {
    expect(code(staff({ groups: [], amr: ['pwd'], auth_time: 0 }))).toBe('STAFF_PERMISSION_MISSING')
  })
})

describe('isStrongSignIn', () => {
  it('takes a passkey or several factors, as the app does for its own people', () => {
    for (const amr of [['mfa'], ['hwk'], ['swk'], ['pwd', 'mfa', 'otp']]) expect(isStrongSignIn({ amr }, [])).toBe(true)
    for (const amr of [['pwd'], ['otp'], ['sms'], [], 'mfa']) expect(isStrongSignIn({ amr }, [])).toBe(false)
  })

  it('takes a configured acr level instead', () => {
    expect(isStrongSignIn({ acr: 'gold' }, ['gold'])).toBe(true)
    expect(isStrongSignIn({ acr: 'bronze' }, ['gold'])).toBe(false)
    expect(isStrongSignIn({ acr: 'gold' }, [])).toBe(false)
  })
})

describe('reasonProblem', () => {
  it('asks for a reason of some length, not counting spaces around it', () => {
    expect(reasonProblem('')).toMatch(/Say why/)
    expect(reasonProblem('   help    ')).toMatch(/at least 10 characters/)
    expect(reasonProblem('Ticket 4211: invoice totals look wrong')).toBeUndefined()
  })
})

describe('staffLabel', () => {
  it('is the address, or the subject without one', () => {
    expect(staffLabel(staff())).toBe('alex@operator.example')
    expect(staffLabel(staff({ email: undefined }))).toBe('staff-1')
  })
})

describe('isRefusedForStaff', () => {
  it("refuses changes to the person's sign-in and saving the sign-in policy", () => {
    for (const path of ['/change-password', '/change-email', '/two-factor/disable', '/two-factor/enable', '/passkey/delete-passkey', '/passkey/verify-registration', '/revoke-sessions']) {
      expect(isRefusedForStaff(path, 'POST')).toBe(true)
    }
    expect(isRefusedForStaff('/policy/sign-in', 'POST')).toBe(true)
  })

  it('lets reading go through', () => {
    for (const path of ['/get-session', '/token', '/account/sign-in-methods', '/passkey/list-user-passkeys']) expect(isRefusedForStaff(path, 'GET')).toBe(false)
    expect(isRefusedForStaff('/policy/sign-in', 'GET')).toBe(false)
    expect(isRefusedForStaff('/staff/stop', 'POST')).toBe(false)
  })
})

describe('isStaffSession', () => {
  it('is a session the admin plugin marks as started by someone else', () => {
    expect(isStaffSession({ impersonatedBy: 'alex@operator.example' })).toBe(true)
    expect(isStaffSession({ impersonatedBy: null })).toBe(false)
    expect(isStaffSession({})).toBe(false)
  })
})
