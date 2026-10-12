import type { energyLabels, propertyTypes } from './data'

/** How the listing's values read, shared by the views that show them: listings and search profiles. */
export const offerTypeLabels = { sale: 'For sale', rent: 'For rent' }

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
