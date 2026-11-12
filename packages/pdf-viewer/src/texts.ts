// The admin app writes the language its screens are in on <html lang>, which is where a plugin reads it.
const texts = {
  en: { page: (number: number, count: number) => `Page ${number} of ${count}` },
  nl: { page: (number: number, count: number) => `Pagina ${number} van ${count}` },
}

/** The viewer's texts in the app's language, English when it is one the viewer has none for. */
export const text = () => (document.documentElement.lang === 'nl' ? texts.nl : texts.en)
