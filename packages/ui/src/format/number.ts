import { cachedFormat } from './intl-cache'
import { text } from './messages'

const grouped = () => cachedFormat('grouped', (tag) => new Intl.NumberFormat(tag))

export const formatInt = (value: number) => grouped().format(value)

export const formatSigned = (value: number) => (value > 0 ? `+${grouped().format(value)}` : grouped().format(value).replace('-', '−'))

export const formatPercent = (value: number) => `${value}%`

export const formatApproxRows = (count: number) => {
  if (count < 10_000) return text('rows', { count: formatInt(count), n: count })
  const magnitude = 10 ** (Math.floor(Math.log10(count)) - 3)
  return text('aboutRows', { count: formatInt(Math.round(count / magnitude) * magnitude) })
}
