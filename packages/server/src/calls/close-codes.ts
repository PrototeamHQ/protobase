import { resumeCloseCode, type MemberEnd } from './media-backend'

// The codes of a socket that was lost, not closed: the server going away or restarting, as in a deploy, a connection
// that broke without a close frame, or Protobase asking the browser to resume.
const lostCodes = new Set([1001, 1005, 1006, 1012, resumeCloseCode])

/**
 * How a member's socket ended, by its close code: lost, so the browser may resume within the grace, or left. Every
 * other code is left, the server's 1008 and 1011 among them, so a check that refused the caller or could not run ends
 * their time in the call at once.
 */
export const memberEnd = (code: number): MemberEnd => (lostCodes.has(code) ? 'lost' : 'left')
