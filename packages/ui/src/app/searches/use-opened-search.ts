import { useAppAddress } from '../use-app-address'

/**
 * The saved search the list was opened from, by its key, as the address names it ("View all results" does), and `open`
 * to name another, such as a search just saved.
 */
export const useOpenedSearch = () => {
  const { address, set } = useAppAddress()
  return {
    key: address?.kind === 'list' ? address.savedSearch : undefined,
    open: (key: string) => set({ savedSearch: key }),
  }
}
