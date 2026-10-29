import { useAppAddress } from '../app/use-app-address'

/**
 * A record's call as the app's address holds it: whether the page joins it (`call=join`), the link that joins it, as a
 * ring's Accept and a call mark's Join open it, and the link back to the record without the call, as Leave opens it.
 */
export const useRecordCallAddress = (resource: string, recordKey: string) => {
  const { address, href, open } = useAppAddress()
  const joining = address?.kind === 'record' && address.resource === resource && address.key === recordKey && address.call === 'join'
  const target = (to: string) => ({ href: to, onFollow: () => open(to) })
  return { joining, join: target(href({ kind: 'record', resource, key: recordKey, call: 'join' })), leave: target(href({ kind: 'record', resource, key: recordKey })) }
}
