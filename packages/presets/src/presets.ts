/** The presets a new app starts from, each written from a project in this repository's examples/. */
export const presets = [
  { name: 'erp', source: 'examples/erp' },
  { name: 'real-estate', source: 'examples/real-estate' },
  { name: 'scratch', source: 'examples/scratch' },
] as const

export type Preset = (typeof presets)[number]
