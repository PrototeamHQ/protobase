/** The headers of a list or record read: it varies with `Prefer`, and carries the live token when one was asked for and made. */
export const liveHeaders = (token: string | undefined): Record<string, string> =>
  token ? { Vary: 'Prefer', 'Preference-Applied': 'live', 'Protobase-Live': token } : { Vary: 'Prefer' }
