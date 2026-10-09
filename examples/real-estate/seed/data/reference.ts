export const amenities = [
  ['balcony', 'Balcony'], ['garden', 'Garden'], ['roof_terrace', 'Roof terrace'], ['lift', 'Lift'],
  ['parking', 'Parking space'], ['bike_storage', 'Bike storage'], ['storage_room', 'Storage room'],
  ['solar_panels', 'Solar panels'], ['heat_pump', 'Heat pump'], ['furnished', 'Furnished'],
] as const

export type AmenityCode = (typeof amenities)[number][0]

// Where each organization lets homes: a city centre (lat/lng), its postal code range and the market rent per m2 in 2026.
export type City = readonly [name: string, lat: number, lng: number, postalFrom: number, postalTo: number, rentPerM2: number]

export const trades = ['plumbing', 'heating', 'electrical', 'roofing', 'carpentry', 'locksmith', 'pest_control', 'general'] as const

export type Trade = (typeof trades)[number]

export const orgSpecs = [
  {
    id: 1,
    name: 'Grachtenhof Vastgoedbeheer B.V.',
    slug: 'grachtenhof',
    city: 'Amsterdam',
    kvk: '34187726',
    share: 0.7,
    seed: 301,
    cities: [
      ['Amsterdam', 52.3676, 4.9041, 1011, 1109, 25], ['Haarlem', 52.3874, 4.6462, 2011, 2037, 21],
      ['Utrecht', 52.0907, 5.1214, 3511, 3585, 22], ['Amstelveen', 52.3114, 4.8701, 1181, 1189, 23.5],
      ['Zaandam', 52.4420, 4.8292, 1501, 1509, 18.5], ['Hilversum', 52.2292, 5.1669, 1211, 1223, 19],
    ] as readonly City[],
    users: [
      ['Sanne', 'M.', 'admin'], ['Daan', 'K.', 'manager'], ['Femke', 'D.', 'manager'], ['Joost', 'R.', 'finance'],
      ['Mirjam', 'V.', 'finance'], ['Thijs', 'W.', 'maintenance'], ['Bram', 'B.', 'maintenance'], ['Lieke', 'P.', 'manager'],
    ] as const,
    vendors: [
      ['Loodgietersbedrijf De Waal', 'plumbing', 68], ['Installatietechniek Van Dam', 'heating', 74], ['Elektro Mulder', 'electrical', 65],
      ['Dakwerken Brouwer', 'roofing', 70], ['Timmerbedrijf Kok', 'carpentry', 58], ['Slotenservice Amstel', 'locksmith', 82],
      ['Ongediertebestrijding Noord', 'pest_control', 90], ['Klusbedrijf Jansen', 'general', 52], ['CV-Service Haarlem', 'heating', 71],
      ['Loodgieter Vos & Zn.', 'plumbing', 64],
    ] as const,
  },
  {
    id: 2,
    name: 'Maaskant Verhuur & Beheer B.V.',
    slug: 'maaskant',
    city: 'Rotterdam',
    kvk: '24411509',
    share: 0.3,
    seed: 402,
    cities: [
      ['Rotterdam', 51.9244, 4.4777, 3011, 3089, 19.5], ['Den Haag', 52.0705, 4.3007, 2491, 2597, 20],
      ['Delft', 52.0116, 4.3571, 2611, 2629, 20.5], ['Dordrecht', 51.8133, 4.6901, 3311, 3329, 15.5],
      ['Schiedam', 51.9192, 4.3988, 3111, 3125, 16.5], ['Breda', 51.5719, 4.7683, 4811, 4838, 17],
    ] as readonly City[],
    users: [
      ['Anouk', 'L.', 'admin'], ['Ruben', 'S.', 'manager'], ['Eva', 'H.', 'finance'], ['Pieter', 'T.', 'maintenance'], ['Noor', 'G.', 'maintenance'],
    ] as const,
    vendors: [
      ['Loodgietersbedrijf Maasstad', 'plumbing', 66], ['Warmtetechniek Rijnmond', 'heating', 72], ['Elektrotechniek De Jong', 'electrical', 63],
      ['Dakdekkersbedrijf Visser', 'roofing', 69], ['Klus & Timmerwerk Smit', 'carpentry', 55], ['Sleutelspecialist Zuid', 'locksmith', 80],
      ['Plaagdierbeheer West', 'pest_control', 88], ['Allround Onderhoud Bakker', 'general', 50],
    ] as const,
  },
] as const
