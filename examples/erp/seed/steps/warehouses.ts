import type { Db } from '../../db/connection'
import { DAY, windowStart } from '../calendar'
import { copyRows } from '../copy'
import { aislesPerZone, binsPerAisle, zones } from '../data/layout'
import { iso, row } from '../format'
import type { World } from '../world'

const createdAt = iso(windowStart - 4 * 365 * DAY)
const label = (prefix: string, number: number) => `${prefix}_${String(number).padStart(2, '0')}`

function* warehouseRows(world: World) {
  for (const org of world.orgs) {
    for (const warehouse of org.warehouses) yield row(warehouse.id, org.id, warehouse.code, warehouse.name, warehouse.city, warehouse.country, createdAt, createdAt)
  }
}

// Depth-first, matching the offsets in data/layout.ts.
function* locationRows(world: World) {
  for (const org of world.orgs) {
    for (const warehouse of org.warehouses) {
      const root = warehouse.code.toLowerCase().replace('-', '_')
      let id = warehouse.firstLocationId
      const location = (path: string, name: string) => row(id++, org.id, warehouse.id, path, name, createdAt, createdAt)
      for (let zone = 0; zone < zones; zone++) {
        const zoneLabel = `zone_${String.fromCharCode(97 + zone)}`
        yield location(`${root}.${zoneLabel}`, `Zone ${String.fromCharCode(65 + zone)}`)
        for (let aisle = 1; aisle <= aislesPerZone; aisle++) {
          const aisleLabel = label('aisle', aisle)
          yield location(`${root}.${zoneLabel}.${aisleLabel}`, `Zone ${String.fromCharCode(65 + zone)} / Aisle ${aisle}`)
          for (let bin = 1; bin <= binsPerAisle; bin++) {
            yield location(`${root}.${zoneLabel}.${aisleLabel}.bin_${bin}`, `Zone ${String.fromCharCode(65 + zone)} / Aisle ${aisle} / Bin ${bin}`)
          }
        }
      }
    }
  }
}

export const seedWarehouses = async (sql: Db, world: World) => {
  await copyRows(sql, 'inventory.warehouses (id, organization_id, code, name, city, country_code, created_at, updated_at)', warehouseRows(world))
  await copyRows(sql, 'inventory.locations (id, organization_id, warehouse_id, path, name, created_at, updated_at)', locationRows(world))
}
