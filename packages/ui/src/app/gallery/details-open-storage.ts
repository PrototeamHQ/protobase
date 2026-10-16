import { guarded } from '../../lib/guarded'

/** Where this browser remembers whether the lightbox opens with a photo's details shown. */
export const detailsOpenStorageKey = 'protobase:lightbox-details'

/** Whether the lightbox's details were left open in this browser; closed until someone opens them. */
export const readDetailsOpen = (storage: Pick<Storage, 'getItem'>) => guarded(() => storage.getItem(detailsOpenStorageKey) === 'true', false)

/** Remembers only open details, so the default (closed) costs no storage. */
export const writeDetailsOpen = (storage: Pick<Storage, 'setItem' | 'removeItem'>, open: boolean) =>
  guarded(() => (open ? storage.setItem(detailsOpenStorageKey, 'true') : storage.removeItem(detailsOpenStorageKey)), undefined)
