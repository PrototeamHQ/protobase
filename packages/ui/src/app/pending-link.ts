export type NavigateOptions = { replace?: boolean; keepScroll?: boolean }

/** A link followed while a guard asks first, held with its options until the person chooses to leave. */
export type PendingLink = { kind: 'link'; full: string; replace: boolean; keepScroll: boolean }

export const pendingLink = (full: string, { replace = false, keepScroll = false }: NavigateOptions = {}): PendingLink => ({ kind: 'link', full, replace, keepScroll })

/** Follows a confirmed pending link as the link itself would have been followed with no guard in the way. */
export const followLink = (link: PendingLink, go: (full: string, replace: boolean, keepScroll: boolean) => void) => go(link.full, link.replace, link.keepScroll)
