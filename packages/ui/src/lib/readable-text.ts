// WCAG relative luminance of a `#rgb` or `#rrggbb` colour.
const luminance = (hex: string) => {
  const digits = hex.slice(1)
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits
  const [r, g, b] = [0, 2, 4].map((at) => {
    const channel = Number.parseInt(full.slice(at, at + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

const light = '#ffffff'
const dark = '#111827'

/** The text colour, white or near black, that reads best on a hex background. */
export const readableOn = (background: string) => {
  const shade = luminance(background)
  return (1.05 / (shade + 0.05) >= (shade + 0.05) / (luminance(dark) + 0.05) ? light : dark)
}
