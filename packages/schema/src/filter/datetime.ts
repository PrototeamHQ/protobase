const daysIn = (year: number, month: number) => {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export const isValidDate = (text: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month)
}

export const isValidTimestamp = (text: string) => {
  const match =
    /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(text)
  if (!match) return false
  const [hour, minute, second] = [Number(match[2]), Number(match[3]), Number(match[4])]
  const [offsetHour, offsetMinute] = [Number(match[5] ?? 0), Number(match[6] ?? 0)]
  return (
    isValidDate(match[1]!) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  )
}
