/** Street names, by country; a listing's address is one with a house number in the country's way. */
export const streets = {
  NL: [
    'Keizersgracht', 'Prinsengracht', 'Herengracht', 'Kerkstraat', 'Molenweg', 'Dorpsstraat', 'Stationsweg', 'Julianalaan',
    'Wilhelminastraat', 'Beatrixlaan', 'Parkweg', 'Schoolstraat', 'Lindelaan', 'Eikenlaan', 'Beukenlaan', 'Rozengracht',
    'Vondelstraat', 'Van Goghstraat', 'Rembrandtlaan', 'Oranjestraat', 'Nieuwe Binnenweg', 'Burgemeester de Withstraat',
    'Koningin Emmaplein', 'Spaarne', 'Oudegracht', 'Singel', 'Havenstraat', 'Zeeweg', 'Polderweg', 'Hoofdstraat',
  ],
  ES: [
    'Calle Mayor', 'Calle de Serrano', 'Calle de Alcalá', 'Gran Vía', 'Avenida de la Constitución', 'Calle del Sol',
    'Paseo de Gracia', 'Carrer de Mallorca', 'Calle Real', 'Calle San Fernando', 'Avenida del Mar', 'Calle de la Paz',
    'Calle Larios', 'Calle Nueva', 'Calle de las Flores', 'Avenida de Andalucía', 'Calle Colón', 'Carrer de Balmes',
    'Calle de Velázquez', 'Paseo Marítimo', 'Calle del Carmen', 'Calle Cervantes', 'Plaza de España', 'Calle Goya',
  ],
} as const

/** Agency names: a first part and a second, joined by the country's word order. */
export const agencyNames = {
  NL: {
    first: ['Van der Berg', 'De Vries', 'Bakker', 'Jansen', 'Visser', 'Smit', 'Mulder', 'De Boer', 'Dekker', 'Brouwer', 'Hendriks', 'Kok'],
    second: ['Makelaars', 'Makelaardij', 'Wonen', 'Vastgoed', 'Woningmakelaars', 'Huis & Hypotheek'],
  },
  ES: {
    first: ['Inmobiliaria', 'Fincas', 'Casas', 'Hogar', 'Viviendas', 'Gestión Inmobiliaria'],
    second: ['del Sol', 'Mediterráneo', 'Castellana', 'Costa', 'Centro', 'Ribera', 'Atlántico', 'Alhambra', 'Retiro', 'Diagonal'],
  },
} as const

/** People who show homes. */
export const agentNames = {
  NL: {
    first: ['Sanne', 'Daan', 'Lotte', 'Bram', 'Femke', 'Ruben', 'Iris', 'Jesse', 'Noor', 'Thijs', 'Eva', 'Lars'],
    last: ['de Jong', 'Janssen', 'de Groot', 'van Dijk', 'Meijer', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen'],
  },
  ES: {
    first: ['Lucía', 'Javier', 'Carmen', 'Pablo', 'María', 'Alejandro', 'Elena', 'Daniel', 'Sofía', 'Sergio', 'Laura', 'Diego'],
    last: ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Fernández', 'Ruiz', 'Díaz', 'Moreno'],
  },
} as const

/** The opening line of a description, by property type. */
export const openings: Record<string, readonly string[]> = {
  apartment: ['A bright apartment', 'A well-kept apartment', 'A spacious flat', 'A light apartment with high ceilings'],
  house: ['A family home', 'A detached house', 'A semi-detached house', 'A comfortable family house'],
  townhouse: ['A characterful townhouse', 'A terraced house', 'A narrow canal-side townhouse', 'A renovated townhouse'],
  villa: ['A modern villa', 'A villa with a pool', 'A light-filled villa', 'A quiet villa'],
  studio: ['A compact studio', 'A smart studio', 'A studio close to everything'],
  penthouse: ['A penthouse with views', 'A top-floor penthouse', 'A penthouse with a roof terrace'],
}

/** Further sentences a description may use, each about one thing. */
export const details = {
  garden: 'The garden faces south and gets the sun all afternoon.',
  balcony: 'The balcony is large enough for a table and four chairs.',
  parking: 'A parking space comes with the home.',
  renovated: 'The kitchen and bathroom were renewed recently.',
  transport: 'Shops, schools and the station are within walking distance.',
  quiet: 'It lies in a quiet street, close to a park.',
  original: 'Original details such as the stairs and ceilings have been kept.',
  insulated: 'Well insulated, with double glazing and solar panels.',
} as const
