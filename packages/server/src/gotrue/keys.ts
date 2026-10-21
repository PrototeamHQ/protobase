import type { JSONWebKeySet } from 'jose'
import { supabasePath } from '../supabase-paths'

// The access tokens of the GoTrue-compatible endpoints are apart from Protobase's own: signed ES256, which supabase-js
// verifies itself, where Protobase's are EdDSA; issued by `<baseURL>/api/sb/auth/v1` to the audience `authenticated`, as
// Supabase's are, so neither kind passes for the other.

/** Where the GoTrue-compatible endpoints are served, below the app's origin. */
export const goTruePath = `${supabasePath}/auth/v1`

/** The key pair the JWT plugin keeps beside its EdDSA one for these tokens; it makes it on the first token. */
export const goTrueKeyPair = { alg: 'ES256' } as const

export const goTrueAlgorithm = goTrueKeyPair.alg

/** The audience of every such token: the database role a signed-in user's requests run as. */
export const goTrueAudience = 'authenticated'

/** The issuer of the tokens of the app at `baseURL`. */
export const goTrueIssuer = (baseURL: string) => `${baseURL.replace(/\/+$/, '')}${goTruePath}`

/** The keys of the JWT plugin's key set that sign these tokens. */
export const goTrueKeys = (set: JSONWebKeySet): JSONWebKeySet => ({ keys: set.keys.filter((key) => key.alg === goTrueAlgorithm) })
