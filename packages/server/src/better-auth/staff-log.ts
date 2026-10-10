import type { DBAdapter } from 'better-auth'

/** Better Auth's model for the log of staff sign-ins: one row per session staff started as someone. */
export const staffSignInModel = 'staffSignIn'

export const staffSignInSchema = {
  [staffSignInModel]: {
    modelName: 'staff_sign_in',
    fields: {
      userId: { type: 'string', required: true, fieldName: 'user_id' },
      userEmail: { type: 'string', required: true, fieldName: 'user_email' },
      staff: { type: 'string', required: true },
      staffName: { type: 'string', required: false, fieldName: 'staff_name' },
      staffSubject: { type: 'string', required: true, fieldName: 'staff_subject' },
      issuer: { type: 'string', required: true },
      reason: { type: 'string', required: true },
      sessionId: { type: 'string', required: true, fieldName: 'session_id' },
      startedAt: { type: 'date', required: true, fieldName: 'started_at' },
      expiresAt: { type: 'date', required: true, fieldName: 'expires_at' },
      endedAt: { type: 'date', required: false, fieldName: 'ended_at' },
    },
  },
} as const

type Row = {
  id: string
  userId: string
  userEmail: string
  staff: string
  staffName?: string | null
  staffSubject: string
  issuer: string
  reason: string
  sessionId: string
  startedAt: Date
  expiresAt: Date
  endedAt?: Date | null
}

export type NewStaffSignIn = Omit<Row, 'id' | 'endedAt'>

/** A staff sign-in as the log and the banner show it: who, as whom, why, and when it started and ends (or ended). */
export type StaffSignIn = { id: string; user: string; staff: string; staffName?: string; reason: string; startedAt: string; expiresAt: string; endedAt?: string }

const entry = (row: Row): StaffSignIn => ({
  id: row.id,
  user: row.userEmail,
  staff: row.staff,
  ...(row.staffName && { staffName: row.staffName }),
  reason: row.reason,
  startedAt: new Date(row.startedAt).toISOString(),
  expiresAt: new Date(row.expiresAt).toISOString(),
  ...(row.endedAt && { endedAt: new Date(row.endedAt).toISOString() }),
})

export const logStaffSignIn = async (adapter: Pick<DBAdapter, 'create'>, data: NewStaffSignIn) => {
  await adapter.create({ model: staffSignInModel, data })
}

export const staffSignInOfSession = async (adapter: Pick<DBAdapter, 'findOne'>, sessionId: string) => {
  const row = await adapter.findOne<Row>({ model: staffSignInModel, where: [{ field: 'sessionId', value: sessionId }] })
  return row ? entry(row) : undefined
}

export const endStaffSignIn = async (adapter: Pick<DBAdapter, 'update'>, sessionId: string) => {
  await adapter.update({ model: staffSignInModel, where: [{ field: 'sessionId', value: sessionId }], update: { endedAt: new Date() } })
}

/** The newest staff sign-ins first, at most `limit`. */
export const listStaffSignIns = async (adapter: Pick<DBAdapter, 'findMany'>, limit = 100) =>
  (await adapter.findMany<Row>({ model: staffSignInModel, sortBy: { field: 'startedAt', direction: 'desc' }, limit })).map(entry)
