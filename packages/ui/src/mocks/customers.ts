import { pick, rngAt, weighted } from './rng'

const locales = {
  NL: {
    stems: ['Polder', 'Rijnland', 'Kuststaal', 'Delta', 'Veluwe', 'Maasvallei', 'Tulpen', 'Grachten', 'Noordzee', 'Waterland', 'Brabant', 'Zeeuwse'],
    nouns: ['Logistiek', 'Techniek', 'Verpakking', 'Installatie', 'Groothandel', 'Metaal', 'Bouwstoffen', 'Fietsen'],
    suffix: 'B.V.',
    cities: ['Rotterdam', 'Eindhoven', 'Utrecht', 'Zwolle', 'Breda', 'Groningen'],
  },
  DE: {
    stems: ['Nordlicht', 'Eifel', 'Rhein-Main', 'Schwarzwald', 'Hansa', 'Alpen', 'Elbe', 'Bergisch', 'Ruhr', 'Isar'],
    nouns: ['Werkzeuge', 'Präzision', 'Maschinenbau', 'Handel', 'Elektro', 'Logistik', 'Verpackung', 'Systemtechnik'],
    suffix: 'GmbH',
    cities: ['Düsseldorf', 'Köln', 'Stuttgart', 'Hamburg', 'Münster', 'Nürnberg'],
  },
  GB: {
    stems: ['Brightwater', 'Ironbridge', 'Harbour Street', 'Kestrel', 'Northgate', 'Oakfield', 'Redwood', 'Stonebridge', 'Millbrook'],
    nouns: ['Trading', 'Supplies', 'Engineering', 'Fabrication', 'Distribution', 'Packaging'],
    suffix: 'Ltd',
    cities: ['Leeds', 'Bristol', 'Birmingham', 'Manchester', 'Sheffield'],
  },
} as const

export const customerCount = 480

export const customerAt = (index: number) => {
  const rand = rngAt(11, index % customerCount)
  const country = weighted(rand, [['NL', 5], ['DE', 3], ['GB', 2]] as const)
  const locale = locales[country]
  return {
    id: `C-${1000 + (index % customerCount)}`,
    name: `${pick(rand, locale.stems)} ${pick(rand, locale.nouns)} ${locale.suffix}`,
    country,
    city: pick(rand, locale.cities),
  }
}

export type Customer = ReturnType<typeof customerAt>
