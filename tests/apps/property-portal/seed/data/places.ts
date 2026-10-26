/**
 * The places listings are in: name, region, latitude, longitude and how many listings it draws relative to the others.
 * Coordinates are each place's centre, as a search around it measures from.
 */
export type PlaceSeed = { name: string; region: string; country: 'NL' | 'ES'; latitude: number; longitude: number; weight: number; postal: string }

const nl = (name: string, region: string, latitude: number, longitude: number, weight: number, postal: string): PlaceSeed => ({ name, region, country: 'NL', latitude, longitude, weight, postal })
const es = (name: string, region: string, latitude: number, longitude: number, weight: number, postal: string): PlaceSeed => ({ name, region, country: 'ES', latitude, longitude, weight, postal })

// `postal` is the first part of the place's postal codes: four digits in the Netherlands, two (the province) in Spain.
export const places: PlaceSeed[] = [
  nl('Amsterdam', 'Noord-Holland', 52.3676, 4.9041, 10, '10'),
  nl('Rotterdam', 'Zuid-Holland', 51.9244, 4.4777, 8, '30'),
  nl('Den Haag', 'Zuid-Holland', 52.0705, 4.3007, 7, '25'),
  nl('Utrecht', 'Utrecht', 52.0907, 5.1214, 7, '35'),
  nl('Eindhoven', 'Noord-Brabant', 51.4416, 5.4697, 5, '56'),
  nl('Groningen', 'Groningen', 53.2194, 6.5665, 4, '97'),
  nl('Haarlem', 'Noord-Holland', 52.3874, 4.6462, 4, '20'),
  nl('Amstelveen', 'Noord-Holland', 52.3114, 4.8701, 2, '11'),
  nl('Zaandam', 'Noord-Holland', 52.4420, 4.8292, 2, '15'),
  nl('Leiden', 'Zuid-Holland', 52.1601, 4.4970, 3, '23'),
  nl('Delft', 'Zuid-Holland', 52.0116, 4.3571, 2, '26'),
  nl('Amersfoort', 'Utrecht', 52.1561, 5.3878, 3, '38'),
  nl('Zeist', 'Utrecht', 52.0893, 5.2312, 1, '37'),
  nl('Nijmegen', 'Gelderland', 51.8126, 5.8372, 3, '65'),
  nl('Arnhem', 'Gelderland', 51.9851, 5.8987, 3, '68'),
  nl('Zwolle', 'Overijssel', 52.5168, 6.0830, 2, '80'),
  nl('Maastricht', 'Limburg', 50.8514, 5.6910, 2, '62'),
  nl('Breda', 'Noord-Brabant', 51.5719, 4.7683, 3, '48'),
  nl('Tilburg', 'Noord-Brabant', 51.5555, 5.0913, 3, '50'),
  nl('Den Bosch', 'Noord-Brabant', 51.6978, 5.3037, 2, '52'),
  nl('Almere', 'Flevoland', 52.3508, 5.2647, 3, '13'),
  nl('Hilversum', 'Noord-Holland', 52.2292, 5.1669, 2, '12'),
  es('Madrid', 'Comunidad de Madrid', 40.4168, -3.7038, 10, '28'),
  es('Barcelona', 'Cataluña', 41.3874, 2.1686, 9, '08'),
  es('Valencia', 'Comunitat Valenciana', 39.4699, -0.3763, 6, '46'),
  es('Sevilla', 'Andalucía', 37.3891, -5.9845, 5, '41'),
  es('Málaga', 'Andalucía', 36.7213, -4.4214, 5, '29'),
  es('Marbella', 'Andalucía', 36.5101, -4.8825, 3, '29'),
  es('Granada', 'Andalucía', 37.1773, -3.5986, 2, '18'),
  es('Bilbao', 'País Vasco', 43.2630, -2.9350, 3, '48'),
  es('San Sebastián', 'País Vasco', 43.3183, -1.9812, 2, '20'),
  es('Zaragoza', 'Aragón', 41.6488, -0.8891, 3, '50'),
  es('Alicante', 'Comunitat Valenciana', 38.3452, -0.4810, 4, '03'),
  es('Palma', 'Illes Balears', 39.5696, 2.6502, 3, '07'),
  es('Las Palmas de Gran Canaria', 'Canarias', 28.1235, -15.4363, 2, '35'),
  es('Getafe', 'Comunidad de Madrid', 40.3057, -3.7329, 1, '28'),
  es('Pozuelo de Alarcón', 'Comunidad de Madrid', 40.4351, -3.8135, 1, '28'),
  es('Sitges', 'Cataluña', 41.2370, 1.8059, 1, '08'),
  es('Badalona', 'Cataluña', 41.4500, 2.2474, 1, '08'),
  es('Girona', 'Cataluña', 41.9794, 2.8214, 1, '17'),
  es('Santander', 'Cantabria', 43.4623, -3.8099, 1, '39'),
  es('Valladolid', 'Castilla y León', 41.6523, -4.7245, 1, '47'),
]
