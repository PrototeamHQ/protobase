import { SignJWT } from 'jose'

// Supabase Auth, as tests/supabase-auth/stack.sh starts it: its own sign-up, password and one-time-code sign-in, and
// its admin endpoints, which take a service_role token signed with its JWT secret.

const authUrl = () => process.env.TEST_SUPABASE_AUTH_URL!

const serviceToken = () =>
  new SignJWT({ role: 'service_role' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.TEST_SUPABASE_AUTH_JWT_SECRET!))

const call = async (method: string, path: string, body: unknown, token?: string) => {
  const response = await fetch(`${authUrl()}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, any> }
}

/** Signs up through Supabase Auth, which confirms the address at once (GOTRUE_MAILER_AUTOCONFIRM). */
export const supabaseSignUp = (email: string, password: string, data: Record<string, unknown>) => call('POST', '/signup', { email, password, data })

export const supabasePasswordSignIn = (email: string, password: string) => call('POST', '/token?grant_type=password', { email, password })

/** Signs in by the one-time code Supabase Auth would email: the admin API makes the code, `/verify` takes it. */
export const supabaseCodeSignIn = async (email: string) => {
  const link = await call('POST', '/admin/generate_link', { type: 'magiclink', email }, await serviceToken())
  if (link.status !== 200) return link
  return call('POST', '/verify', { type: 'email', email, token: link.body.email_otp })
}

/** Changes the user's own metadata, as supabase.auth.updateUser does with their session. */
export const supabaseUpdateOwnUser = (accessToken: string, data: Record<string, unknown>) => call('PUT', '/user', { data }, accessToken)

export const supabaseBan = async (id: string, duration: string) => call('PUT', `/admin/users/${id}`, { ban_duration: duration }, await serviceToken())
