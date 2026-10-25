/**
 * Where a notification's link goes: `app` a page of this app, followed in place by the app's router at `path` (without
 * the app's base path); `page` another page on this origin, loaded in this tab; `external` another origin, opened in a
 * new tab. A notification without a url, or with one that is not `http` or `https`, has no link.
 */
export type NotificationTarget = { kind: 'app'; href: string; path: string } | { kind: 'page' | 'external'; href: string }

export const notificationTarget = (url: string | null, { origin, basePath }: { origin: string; basePath: string }): NotificationTarget | undefined => {
  if (url === null) return undefined
  if (!URL.canParse(url, origin)) return undefined
  const target = new URL(url, origin)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return undefined
  if (target.origin !== origin) return { kind: 'external', href: target.href }
  const local = `${target.pathname}${target.search}${target.hash}`
  if (basePath === '') return { kind: 'app', href: local, path: local }
  if (target.pathname === basePath || target.pathname.startsWith(`${basePath}/`)) return { kind: 'app', href: local, path: local.slice(basePath.length) || '/' }
  return { kind: 'page', href: local }
}
