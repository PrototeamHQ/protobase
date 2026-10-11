/** Where a menu link may point: a web or mail address outside the admin, never `javascript:` or a path inside it. */
export const isMenuHref = (href: string) => /^(https?:\/\/|mailto:)/i.test(href)
