import type { Signer } from './signer'

/** Download URLs stay valid one to two hours and repeat within the hour, so browsers can cache them. */
export const downloadExpiry = (now = Date.now()) => (Math.ceil(now / 3_600_000) + 1) * 3_600

/** What a private download URL grants: one file, of one field of one row. */
export type DownloadGrant = { provider: string; path: string; resource: string; key: string; field: string; expires: number }

const parts = (grant: DownloadGrant) => [grant.provider, grant.path, grant.resource, grant.key, grant.field, grant.expires]

/** `<base>/<provider>/<path>?r=<resource>&k=<key>&f=<field>&exp=<seconds>&sig=<signature>` */
export const signedDownloadUrl = async (signer: Signer, base: string, grant: DownloadGrant) => {
  const query = new URLSearchParams({ r: grant.resource, k: grant.key, f: grant.field, exp: String(grant.expires), sig: await signer.sign('download', parts(grant)) })
  return `${base}/${grant.provider}/${grant.path}?${query}`
}

/** The grant of a download URL whose signature checks out; `expired` once it is past its time. */
export const readDownloadUrl = async (signer: Signer, provider: string, path: string, query: URLSearchParams, now = Date.now()) => {
  const expires = Number(query.get('exp'))
  const grant: DownloadGrant = { provider, path, resource: query.get('r') ?? '', key: query.get('k') ?? '', field: query.get('f') ?? '', expires }
  const signature = query.get('sig') ?? ''
  if (!Number.isSafeInteger(expires) || !(await signer.verify('download', parts(grant), signature))) return { status: 'invalid' as const }
  if (expires * 1000 < now) return { status: 'expired' as const }
  return { status: 'ok' as const, grant }
}
