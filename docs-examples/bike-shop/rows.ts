// The shop's records for the stories of the guide: six customers and fourteen repairs.

export const customerRows = [
  ['Anouk de Vries', '+31 6 1234 5678', 'anouk@example.nl'],
  ['Bram Jansen', '+31 6 2345 6789', null],
  ['Chloé Martin', '+33 6 12 34 56 78', 'chloe@example.fr'],
  ['Daan Bakker', null, 'daan@example.nl'],
  ['Emma Visser', '+31 6 3456 7890', 'emma@example.nl'],
  ['Finn Smit', '+31 6 4567 8901', null],
].map(([name, phone, email], index) => ({ id: index + 1, name, phone, email, country: index === 2 ? 'FR' : 'NL', createdAt: `2026-0${index + 1}-15T10:00:00Z` }))

const repairs: Array<[customer: number, bike: string, problem: string, status: string, mechanic: string | null, estimate: string, paid: boolean, bookedOn: string]> = [
  [1, 'Gazelle Orange', 'Rear brake squeals', 'booked', null, '35.00', false, '2026-10-07'],
  [2, 'Batavus Finez', 'Flat tyre, front', 'booked', null, '18.50', false, '2026-10-07'],
  [3, 'Cortina U4', 'Gears skip under load', 'working', 'Sem', '64.00', false, '2026-10-06'],
  [4, 'VanMoof S5', 'Motor cuts out', 'waiting', 'Lotte', '210.00', false, '2026-10-02'],
  [5, 'Brompton C Line', 'Hinge clamp loose', 'ready', 'Sem', '42.00', false, '2026-10-05'],
  [6, 'Cannondale Topstone', 'Annual service', 'working', 'Lotte', '120.00', false, '2026-10-06'],
  [1, 'Gazelle Orange', 'Chain replacement', 'collected', 'Sem', '55.00', true, '2026-09-20'],
  [2, 'Batavus Finez', 'Light wiring', 'collected', 'Lotte', '27.50', true, '2026-09-12'],
  [3, 'Cortina U4', 'New saddle', 'collected', 'Sem', '39.00', true, '2026-08-30'],
  [5, 'Brompton C Line', 'Tyres, both', 'collected', 'Lotte', '88.00', true, '2026-08-18'],
  [6, 'Cannondale Topstone', 'Bottom bracket creaks', 'ready', 'Lotte', '75.00', true, '2026-10-04'],
  [4, 'VanMoof S5', 'Kickstand', 'booked', null, '15.00', false, '2026-10-08'],
  [1, 'Gazelle Orange', 'Bell', 'collected', 'Sem', '9.50', true, '2026-07-02'],
  [3, 'Cortina U4', 'Spokes, rear wheel', 'waiting', 'Sem', '96.00', false, '2026-10-01'],
]

export const repairRows = repairs.map(([customerId, bike, problem, status, mechanic, estimate, paid, bookedOn], index) => ({
  id: index + 1,
  number: `R-${String(301 + index)}`,
  customerId,
  bike,
  problem,
  status,
  mechanic,
  estimate,
  currency: 'EUR',
  paid,
  bookedOn,
  notes: null,
  updatedAt: `${bookedOn}T09:00:00Z`,
}))
