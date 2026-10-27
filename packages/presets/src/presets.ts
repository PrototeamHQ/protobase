/** The presets a new app starts from, each written from a project in this repository's tests/apps/. */
export const presets = [
  { name: 'erp', source: 'tests/apps/erp' },
  { name: 'property-portal', source: 'tests/apps/property-portal' },
  { name: 'real-estate', source: 'tests/apps/real-estate' },
  { name: 'scratch', source: 'tests/apps/scratch' },
] as const

export type Preset = (typeof presets)[number]
