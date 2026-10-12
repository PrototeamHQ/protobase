import type { energyLabels, propertyTypes } from './data'

/** How the listing's values read, shared by the views that show them: listings and search profiles. */
export const propertyTypeLabels: Record<(typeof propertyTypes)[number], string> = {
  apartment: 'Apartment',
  house: 'House',
  townhouse: 'Townhouse',
  villa: 'Villa',
  studio: 'Studio',
  penthouse: 'Penthouse',
}

export const energyLabelLabels: Record<(typeof energyLabels)[number], string> = {
  a_plus_4: 'A++++',
  a_plus_3: 'A+++',
  a_plus_2: 'A++',
  a_plus: 'A+',
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
  f: 'F',
  g: 'G',
}

/** The colours of the EU energy label for buildings, from dark green for the best label to red for G. */
export const energyLabelColors: Record<(typeof energyLabels)[number], string> = {
  a_plus_4: '#00612e',
  a_plus_3: '#006f35',
  a_plus_2: '#007d3c',
  a_plus: '#008c43',
  a: '#00a651',
  b: '#50b848',
  c: '#bed630',
  d: '#fff200',
  e: '#fdb913',
  f: '#f37021',
  g: '#ed1c24',
}
