import { guarded } from '../lib/guarded'

const prefix = 'protobase:nav-open:'

export const navOpenStorageKey = (itemId: string) => `${prefix}${itemId}`

/** Whether a collapsible sidebar entry was left open in this browser; open until someone closes it. */
export const readNavOpen = (storage: Pick<Storage, 'getItem'>, key: string) => guarded(() => storage.getItem(key) !== 'false', true)

/** Remembers only a closed entry, so the default (open) costs no storage. */
export const writeNavOpen = (storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, open: boolean) =>
  guarded(() => (open ? storage.removeItem(key) : storage.setItem(key, 'false')), undefined)
