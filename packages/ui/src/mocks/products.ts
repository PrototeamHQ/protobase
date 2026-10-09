const catalog = [
  ['M8 hex bolt A2, 100 pcs', 'FST', 1890],
  ['M10 hex nut A2, 100 pcs', 'FST', 1240],
  ['Stainless washer 8 mm, 250 pcs', 'FST', 990],
  ['Cable tie 300 mm, 100 pcs', 'ELC', 650],
  ['Cable gland M20, 25 pcs', 'ELC', 2340],
  ['Junction box IP65', 'ELC', 1480],
  ['Hydraulic hose 1/2 in, 5 m', 'HYD', 8650],
  ['Hydraulic coupling 3/8 in', 'HYD', 1895],
  ['Pallet wrap 500 mm', 'PKG', 740],
  ['Corrugated box 400 x 300', 'PKG', 215],
  ['Bubble wrap roll 50 m', 'PKG', 1990],
  ['Safety gloves, size L', 'PPE', 395],
  ['Safety glasses, clear', 'PPE', 450],
  ['Ear defenders SNR 31', 'PPE', 1295],
  ['Ball bearing 6204-2RS', 'BRG', 685],
  ['Taper roller bearing 30205', 'BRG', 1420],
  ['Timing belt HTD 5M, 600 mm', 'BLT', 2780],
  ['V-belt SPA 1250', 'BLT', 1360],
  ['Grease cartridge, 400 g', 'LUB', 920],
  ['Machine oil ISO 68, 5 l', 'LUB', 3950],
  ['Angle grinder disc 125 mm, 10 pcs', 'ABR', 1880],
  ['Drill bit set HSS, 19 pcs', 'TLS', 3490],
  ['Torque wrench 20-100 Nm', 'TLS', 14900],
  ['Pneumatic cylinder 40 x 100', 'PNE', 6120],
  ['Air hose PU 8 mm, 20 m', 'PNE', 2475],
  ['LED panel 600 x 600, 40 W', 'LGT', 3290],
  ['Pallet label roll 100 x 150', 'LBL', 1175],
  ['Thermal printer ribbon', 'LBL', 890],
  ['Euro pallet EPAL, used', 'PLT', 1150],
  ['Roll container, galvanised', 'PLT', 9800],
] as const

export const productCount = catalog.length

export const productAt = (index: number) => {
  const [name, category, priceCents] = catalog[index % catalog.length]!
  const slot = index % catalog.length
  return {
    id: `P-${200 + slot}`,
    sku: `${category}-${String(1000 + slot * 7).padStart(4, '0')}`,
    name,
    category,
    priceCents,
  }
}

export type Product = ReturnType<typeof productAt>
