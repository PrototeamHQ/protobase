import { DAY, windowEnd, windowStart } from '../calendar'
import { jobTitles, locales, qualifiers } from '../data/names'
import { slugify } from '../format'
import { int, pick, rngAt, weighted } from '../rng'
import type { Org } from '../world'

const legacyShare = 0.6

export const legacyCompanies = (org: Org) => Math.floor(org.companyCount * legacyShare)

// Companies are ordered by creation time: the first 60% predate the window.
export const companyAt = (org: Org, ordinal: number) => {
  const rand = rngAt(org.seed + 1, ordinal)
  const country = weighted(rand, org.locales)
  const locale = locales[country]
  const city = pick(rand, locale.cities)
  const surname = pick(rand, locale.surnames)
  const qualifier = rand() < 0.12 ? ` ${pick(rand, qualifiers)}` : ''
  const base = weighted(rand, [
    [`${pick(rand, locale.stems)} ${pick(rand, locale.nouns)}`, 40],
    [`${surname} ${pick(rand, locale.nouns)}`, 30],
    [`${surname} ${locale.andWord}`, 15],
    [`${city} ${pick(rand, locale.nouns)}`, 15],
  ])
  const domain = `${slugify(base)}.${locale.tld}`
  const legacy = legacyCompanies(org)
  const createdAt =
    ordinal < legacy
      ? Math.floor(windowStart - (1 - ordinal / legacy) * 3 * 365 * DAY)
      : Math.floor(windowStart + ((ordinal - legacy) / (org.companyCount - legacy)) * (windowEnd - windowStart))
  return {
    id: org.companyFirstId + ordinal,
    name: `${base}${qualifier} ${locale.suffix}`,
    country,
    city,
    domain,
    vatNumber: locale.vat(int(rand, 100_000_000, 999_999_999)),
    email: `info@${domain}`,
    phone: `${locale.dial} ${int(rand, 10, 99)} ${int(rand, 1_000_000, 9_999_999)}`,
    status: weighted(rand, [['active', 85], ['dormant', 10], ['lead', 5]] as const),
    createdAt,
  }
}

export const peopleOf = (org: Org, ordinal: number) => org.personStarts[ordinal + 1]! - org.personStarts[ordinal]!

export const personAt = (org: Org, company: ReturnType<typeof companyAt>, ordinal: number, slot: number) => {
  const rand = rngAt(org.seed + 4, org.personStarts[ordinal]! + slot)
  const locale = locales[company.country]
  const first = pick(rand, locale.firstNames)
  const last = pick(rand, locale.surnames)
  return {
    id: org.personFirstId + org.personStarts[ordinal]! + slot,
    first,
    last,
    email: `${slugify(first)}.${slugify(last)}@${company.domain}`,
    phone: rand() < 0.6 ? `${locale.dial} 6 ${int(rand, 10_000_000, 99_999_999)}` : null,
    title: pick(rand, jobTitles),
    createdAt: company.createdAt + int(rand, 0, 20) * 3_600_000,
  }
}
