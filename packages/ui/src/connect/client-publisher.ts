/**
 * Who published a client: the host of its id when the id is an https URL, a client metadata document the server
 * fetched from there, the one identity of a client the server checked. `undefined` for a client that registered
 * itself, whose id the server chose, and whose name says nothing about who made it.
 */
export const clientPublisher = (clientId: string) => {
  if (!URL.canParse(clientId)) return undefined
  const url = new URL(clientId)
  return url.protocol === 'https:' ? url.host : undefined
}
