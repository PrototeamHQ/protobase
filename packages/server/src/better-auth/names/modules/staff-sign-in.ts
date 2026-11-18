import { own, type ModuleDeclaration } from '../declaration'

/** The log of the operator's staff signing in as the app's people: one row per session staff started as someone. */
export const staffSignIn = {
  id: 'staff_sign_in',
  requires: ['auth'],
  tables: {
    staff_sign_in: {
      model: 'staffSignIn',
      scope: 'global',
      columns: {
        user_id: own('userId', { type: 'string', required: true }),
        user_email: own('userEmail', { type: 'string', required: true }),
        staff: own('staff', { type: 'string', required: true }),
        staff_name: own('staffName', { type: 'string', required: false }),
        staff_subject: own('staffSubject', { type: 'string', required: true }),
        issuer: own('issuer', { type: 'string', required: true }),
        reason: own('reason', { type: 'string', required: true }),
        session_id: own('sessionId', { type: 'string', required: true }),
        started_at: own('startedAt', { type: 'date', required: true }),
        expires_at: own('expiresAt', { type: 'date', required: true }),
        ended_at: own('endedAt', { type: 'date', required: false }),
      },
      indexes: ['staff_sign_in_session_id_idx', 'staff_sign_in_started_at_idx'],
    },
  },
} as const satisfies ModuleDeclaration
