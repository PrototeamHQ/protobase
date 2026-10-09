import type { Db } from '../../db/connection'
import { productPriceCents } from '../builders/product'
import { timestamps, yearOf } from '../calendar'
import { copyRows } from '../copy'
import { binOffsets } from '../data/layout'
import { iso, money, row } from '../format'
import { int, makeRng, pick, weighted } from '../rng'
import type { Org, World } from '../world'

const binsPerWarehouse = binOffsets.length

// Moves are generated in time order against a running stock table, so issues and
// transfers never take a bin below zero and the final table is the stock_levels seed.
const createLedger = (org: Org) => {
  const rand = makeRng(org.seed + 11)
  const times = timestamps(org.moveCount, org.seed + 12)
  const bins = org.warehouses.length * binsPerWarehouse
  const stock = new Int32Array(org.productCount * bins)
  const touched = new Uint8Array(stock.length)
  const lastMovedAt = new Float64Array(stock.length)
  const prices = Int32Array.from({ length: org.productCount }, (_, ordinal) => productPriceCents(ordinal))
  const locationOf = (bin: number) => org.warehouses[Math.floor(bin / binsPerWarehouse)]!.firstLocationId + binOffsets[bin % binsPerWarehouse]!
  const warehouseOf = (bin: number) => org.warehouses[Math.floor(bin / binsPerWarehouse)]!.id

  // Each product lives in three home bins, so issues usually find stock.
  const homeBin = (product: number) => (product * 13 + int(rand, 0, 2) * 97) % bins
  const pickProduct = () => Math.floor(rand() ** 1.8 * org.productCount)

  function* moves() {
    let id = org.moveFirstId
    let index = 0
    const move = (product: number, bin: number, kind: string, quantity: number, reference: string | null, at: number, userId: number) => {
      stock[product * bins + bin]! += quantity
      touched[product * bins + bin] = 1
      lastMovedAt[product * bins + bin] = at
      return row(id++, org.id, org.productFirstId + product, warehouseOf(bin), locationOf(bin), kind, quantity, money(Math.round(prices[product]! * 0.62)), reference, iso(at), userId)
    }

    while (index < org.moveCount) {
      const at = times[index]!
      const userId = pick(rand, org.warehouseUsers).id
      const product = pickProduct()
      const bin = homeBin(product)
      const available = stock[product * bins + bin]!
      const wanted = weighted(rand, [['issue', 55], ['receipt', 28], ['transfer', 13], ['adjustment', 4]] as const)
      const kind = wanted !== 'receipt' && available < 1 && wanted !== 'adjustment' ? 'receipt' : wanted
      const orderOrdinal = Math.max(0, Math.min(org.orderCount - 1, Math.floor((index / org.moveCount) * org.orderCount) - int(rand, 0, 50)))

      if (kind === 'issue') {
        const reference = `SO-${yearOf(org.orderTimes[orderOrdinal]!)}-${String(orderOrdinal + 1).padStart(6, '0')}`
        yield move(product, bin, kind, -Math.min(int(rand, 1, 40), available), reference, at, userId)
        index += 1
      } else if (kind === 'transfer' && org.moveCount - index >= 2) {
        const quantity = Math.min(int(rand, 1, 40), available)
        const target = (bin + 1 + int(rand, 0, bins - 2)) % bins
        const reference = `TR-${int(rand, 1000, 9999)}`
        yield move(product, bin, kind, -quantity, reference, at, userId)
        yield move(product, target, kind, quantity, reference, at, userId)
        index += 2
      } else if (kind === 'adjustment') {
        const size = int(rand, 1, 6)
        yield move(product, bin, kind, rand() < 0.5 && available >= size ? -size : size, `CC-${int(rand, 100, 999)}`, at, userId)
        index += 1
      } else {
        yield move(product, bin, 'receipt', int(rand, 5, 100), `PO-${int(rand, 10000, 99999)}`, at, userId)
        index += 1
      }
    }
  }

  function* levels() {
    for (let slot = 0; slot < stock.length; slot++) {
      if (!touched[slot]) continue
      const bin = slot % bins
      yield row(org.productFirstId + Math.floor(slot / bins), locationOf(bin), org.id, stock[slot], iso(lastMovedAt[slot]!))
    }
  }

  return { moves, levels }
}

export const seedLedger = async (sql: Db, world: World) => {
  for (const org of world.orgs) {
    const ledger = createLedger(org)
    await copyRows(sql, 'inventory.stock_moves (id, organization_id, product_id, warehouse_id, location_id, kind, quantity, unit_cost, reference, moved_at, user_id)', ledger.moves())
    await copyRows(sql, 'inventory.stock_levels (product_id, location_id, organization_id, quantity, updated_at)', ledger.levels())
  }
}
