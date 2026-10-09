export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** `companyId` becomes "Company", `discountPercent` becomes "Discount percent". */
export const humanize = (name: string) => {
  const words = name
    .replace(/(Id|Code)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
  return capitalise(words || name)
}
