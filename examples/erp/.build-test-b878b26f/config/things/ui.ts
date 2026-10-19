import { view } from '@protobase/schema'
export const thingsView = view('things').names({ singular: 'Thing 😀', plural: 'Things' }).fields((r) => ({ id: r.id.prefix('€') }))
