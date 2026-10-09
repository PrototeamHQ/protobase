type Item = readonly [name: string, priceCents: number]

export const tree: ReadonlyArray<{ name: string; code: string; children: ReadonlyArray<{ name: string; items: readonly Item[] }> }> = [
  {
    name: 'Fasteners',
    code: 'FST',
    children: [
      { name: 'Bolts', items: [['M8 hex bolt A2, 100 pcs', 1890], ['M12 hex bolt 8.8, 50 pcs', 2150], ['Countersunk screw M5, 200 pcs', 1260]] },
      { name: 'Nuts and washers', items: [['M10 hex nut A2, 100 pcs', 1240], ['Stainless washer 8 mm, 250 pcs', 990], ['Nyloc nut M8, 100 pcs', 1175]] },
      { name: 'Anchors', items: [['Wedge anchor M10 x 100, 20 pcs', 2480], ['Wall plug 8 mm, 200 pcs', 760]] },
    ],
  },
  {
    name: 'Electrical',
    code: 'ELC',
    children: [
      { name: 'Cable management', items: [['Cable tie 300 mm, 100 pcs', 650], ['Cable gland M20, 25 pcs', 2340], ['Cable tray 100 mm, 3 m', 3890]] },
      { name: 'Enclosures', items: [['Junction box IP65', 1480], ['Control cabinet 600 x 400', 12900]] },
      { name: 'Lighting', items: [['LED panel 600 x 600, 40 W', 3290], ['LED high bay 150 W', 8990]] },
    ],
  },
  {
    name: 'Hydraulics',
    code: 'HYD',
    children: [
      { name: 'Hoses', items: [['Hydraulic hose 1/2 in, 5 m', 8650], ['Hydraulic hose 3/4 in, 5 m', 11450]] },
      { name: 'Couplings', items: [['Hydraulic coupling 3/8 in', 1895], ['Quick coupling 1/2 in', 2640], ['Banjo bolt M14', 540]] },
    ],
  },
  {
    name: 'Packaging',
    code: 'PKG',
    children: [
      { name: 'Wrap and tape', items: [['Pallet wrap 500 mm', 740], ['Bubble wrap roll 50 m', 1990], ['Packing tape 48 mm, 6 rolls', 1380]] },
      { name: 'Boxes', items: [['Corrugated box 400 x 300', 215], ['Corrugated box 600 x 400', 340]] },
      { name: 'Labels', items: [['Pallet label roll 100 x 150', 1175], ['Thermal printer ribbon', 890]] },
    ],
  },
  {
    name: 'Safety',
    code: 'PPE',
    children: [
      { name: 'Hand protection', items: [['Safety gloves, size L', 395], ['Cut resistant gloves, size M', 885]] },
      { name: 'Eye and ear', items: [['Safety glasses, clear', 450], ['Ear defenders SNR 31', 1295], ['Earplugs, 200 pairs', 2290]] },
    ],
  },
  {
    name: 'Bearings and belts',
    code: 'BRG',
    children: [
      { name: 'Bearings', items: [['Ball bearing 6204-2RS', 685], ['Taper roller bearing 30205', 1420], ['Pillow block UCP205', 2260]] },
      { name: 'Belts', items: [['Timing belt HTD 5M, 600 mm', 2780], ['V-belt SPA 1250', 1360]] },
    ],
  },
  {
    name: 'Lubricants',
    code: 'LUB',
    children: [
      { name: 'Grease', items: [['Grease cartridge, 400 g', 920], ['High temperature grease, 1 kg', 2150]] },
      { name: 'Oil', items: [['Machine oil ISO 68, 5 l', 3950], ['Hydraulic oil HLP 46, 20 l', 8450], ['Cutting fluid, 10 l', 5480]] },
    ],
  },
  {
    name: 'Tools and pneumatics',
    code: 'TLS',
    children: [
      { name: 'Hand tools', items: [['Drill bit set HSS, 19 pcs', 3490], ['Torque wrench 20-100 Nm', 14900], ['Angle grinder disc 125 mm, 10 pcs', 1880]] },
      { name: 'Pneumatics', items: [['Pneumatic cylinder 40 x 100', 6120], ['Air hose PU 8 mm, 20 m', 2475]] },
      { name: 'Pallets', items: [['Euro pallet EPAL, used', 1150], ['Roll container, galvanised', 9800]] },
    ],
  },
]
