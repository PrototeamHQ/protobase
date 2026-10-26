// Every warehouse gets 3 zones x 4 aisles x 5 bins, stored depth-first:
// zone, then each aisle followed by its bins. Only bins hold stock.
export const zones = 3
export const aislesPerZone = 4
export const binsPerAisle = 5

const zoneSpan = 1 + aislesPerZone * (1 + binsPerAisle)

export const locationsPerWarehouse = zones * zoneSpan

export const zoneOffset = (zone: number) => zone * zoneSpan
export const aisleOffset = (zone: number, aisle: number) => zoneOffset(zone) + 1 + aisle * (1 + binsPerAisle)
export const binOffset = (zone: number, aisle: number, bin: number) => aisleOffset(zone, aisle) + 1 + bin

export const binOffsets = Array.from({ length: zones * aislesPerZone * binsPerAisle }, (_, k) => {
  const zone = Math.floor(k / (aislesPerZone * binsPerAisle))
  const aisle = Math.floor(k / binsPerAisle) % aislesPerZone
  return binOffset(zone, aisle, k % binsPerAisle)
})
