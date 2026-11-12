// The admin app writes the language its screens are in on <html lang>, which is where a plugin reads it.
const texts = {
  en: { actualSize: 'Actual size', dimensions: (width: number, height: number) => `${width} × ${height} pixels` },
  nl: { actualSize: 'Ware grootte', dimensions: (width: number, height: number) => `${width} × ${height} pixels` },
}

/** The viewer's texts in the app's language, English when it is one the viewer has none for. */
export const text = () => (document.documentElement.lang === 'nl' ? texts.nl : texts.en)
