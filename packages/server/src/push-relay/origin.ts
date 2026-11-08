/**
 * The workspace origin `text` names, as the WHATWG parser writes it: `https://` and a host, with a port when it is not
 * the default, and nothing else; `undefined` when it is anything more or less, such as a path or `http://`.
 */
export const workspaceOrigin = (text: unknown) => {
  if (typeof text !== 'string' || text.length > 300 || !URL.canParse(text)) return
  const url = new URL(text)
  if (url.protocol !== 'https:' || url.origin !== text) return
  return url.origin
}
