const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * A field's or resource's name in words, where its view gives no label: `companyId` and `company_id` become "Company",
 * `discountPercent` and `discount_percent` become "Discount percent".
 */
export const humanize = (name: string) => {
  const words = name
    .replace(/(Id|Code|_id|_code)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .trim()
    .toLowerCase()
  return capitalise(words || name)
}
