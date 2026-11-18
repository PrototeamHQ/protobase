/**
 * The header fields of RFC 8058's one-click unsubscribe: `List-Unsubscribe` with the recipient's own link, and
 * `List-Unsubscribe-Post`, which tells the mail client to unsubscribe with a `POST` to it.
 */
export const unsubscribeHeaders = (url: string) => ({ 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
