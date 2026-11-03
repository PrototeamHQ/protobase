/**
 * The app's page at `path`, which starts with `/`, on the origin of `requestURL`: a URL Better Auth resolved for the
 * request (`ctx.context.baseURL`), on the request's host when that is one of the app's origins and on `baseURL`'s
 * otherwise. Only its origin counts, so Better Auth's base path, such as `/api/auth`, never reaches the page.
 */
export const requestAppUrl = (requestURL: string, path: string) => new URL(path, requestURL).href
