/** The path of the sign-in route, below the app's base path. Its steps and the page to come back to are in its query. */
export const signInRoute = '/-/sign-in'

/** The names of the sign-in route's query parameters: the step it shows, and the page to come back to after it. */
export const signInParams = {
  /** The step the route shows, when it is not the first. */
  step: 'step',
  /** The page below the base path to come back to after signing in. */
  next: 'next',
} as const

/**
 * A step of signing in or making an account, each with an address of its own: Back from a step returns to the one
 * before. `email-code` and `sign-up-code` enter the code emailed to an address the step before asked for, and
 * `sign-up-details` asks for the name and password once that code was right.
 */
export const signInSteps = ['sign-in', 'forgot-password', 'email-code', 'sign-up', 'sign-up-code', 'sign-up-details'] as const
/** A step of the sign-in route: one of `signInSteps`. */
export type SignInStep = (typeof signInSteps)[number]

/** Where the sign-in route is: its step, and the page below the base path to come back to, when it names one. */
export type SignInAddress = {
  /** The step the route shows. */
  step: SignInStep
  /** The page below the base path to come back to, when it names one. */
  next?: string
}

const isStep = (value: string | null): value is SignInStep => signInSteps.includes(value as SignInStep)

// A page of this app only: a path below the base path, never another origin or the sign-in route itself.
const localPage = (next: string | null | undefined) => {
  if (!next?.startsWith('/')) return undefined
  const url = new URL(next, 'http://local')
  if (url.origin !== 'http://local' || url.pathname === signInRoute) return undefined
  return `${url.pathname}${url.search}`
}

/** The path below the base path of a step of the sign-in route, coming back to `next` after it, the start by default. */
export const signInPath = ({ step = 'sign-in', next }: { step?: SignInStep; next?: string } = {}) => {
  const params = new URLSearchParams()
  if (step !== 'sign-in') params.set(signInParams.step, step)
  const page = localPage(next)
  if (page && page !== '/') params.set(signInParams.next, page)
  const query = params.toString()
  return query ? `${signInRoute}?${query}` : signInRoute
}

/** The sign-in route's step and the page to come back to, for the path below the base path; `undefined` elsewhere. */
export const readSignInAddress = (path: string, params: URLSearchParams): SignInAddress | undefined => {
  if (path !== signInRoute) return undefined
  const step = params.get(signInParams.step)
  const next = localPage(params.get(signInParams.next))
  return { step: isStep(step) ? step : 'sign-in', ...(next && { next }) }
}
