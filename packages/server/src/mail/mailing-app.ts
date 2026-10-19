/** The app an email comes from: its name, and its home page on the origin the request came to. */
export type MailingApp = { name: string; url: string }

/**
 * The app as an auth email names it: `appName`, and the home page on the origin of `requestURL`, a URL on the origin
 * the request came to (such as Better Auth's `ctx.context.baseURL`), or on `baseURL`'s origin without one.
 */
export const mailingApp = ({ appName, baseURL }: { appName: string; baseURL: string }, requestURL?: string): MailingApp => ({
  name: appName,
  url: new URL('/', requestURL ?? baseURL).href,
})
