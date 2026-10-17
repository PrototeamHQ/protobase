import { f, resource } from '@protobase/schema'
export const things = resource('things').table('things').fields({ id: f.integer() }).primaryKey((r) => r.id)
