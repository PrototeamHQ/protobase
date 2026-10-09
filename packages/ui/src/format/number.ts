const grouped = new Intl.NumberFormat('en-IE')

export const formatInt = (value: number) => grouped.format(value)

export const formatSigned = (value: number) => (value > 0 ? `+${grouped.format(value)}` : grouped.format(value).replace('-', '−'))

export const formatPercent = (value: number) => `${value}%`

export const formatApproxRows = (count: number) => {
  if (count < 10_000) return `${formatInt(count)} rows`
  const magnitude = 10 ** (Math.floor(Math.log10(count)) - 3)
  return `about ${formatInt(Math.round(count / magnitude) * magnitude)} rows`
}
