/**
 * The path of the guests' routes under the API's system path (`/api`), or of one of them: the lobby, the guest call
 * socket, and an organization's switch for guest links.
 */
export const guestCallsPath = (systemPath: string, part?: 'lobby' | 'socket' | 'organization') => `${systemPath}/calls/guests${part ? `/${part}` : ''}`
