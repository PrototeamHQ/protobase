export const countries = [
  ['NL', 'Netherlands', true],
  ['DE', 'Germany', true],
  ['BE', 'Belgium', true],
  ['FR', 'France', true],
  ['AT', 'Austria', true],
  ['PL', 'Poland', true],
  ['IT', 'Italy', true],
  ['ES', 'Spain', true],
  ['DK', 'Denmark', true],
  ['GB', 'United Kingdom', false],
  ['CH', 'Switzerland', false],
  ['NO', 'Norway', false],
] as const

export const currencies = [
  ['EUR', 'Euro', '€', 2],
  ['GBP', 'Pound sterling', '£', 2],
  ['CHF', 'Swiss franc', 'CHF', 2],
  ['DKK', 'Danish krone', 'kr', 2],
  ['PLN', 'Polish zloty', 'zł', 2],
] as const

export const tagNames = [
  ['VIP', '#7c3aed'], ['Key account', '#2563eb'], ['Slow payer', '#dc2626'], ['Reseller', '#0891b2'],
  ['Export', '#059669'], ['Prospect', '#d97706'], ['Partner', '#4f46e5'], ['Seasonal', '#ca8a04'],
  ['Government', '#475569'], ['Education', '#0d9488'], ['Credit hold', '#b91c1c'], ['Framework contract', '#9333ea'],
] as const

export const orgSpecs = [
  {
    id: 1,
    name: 'Rijnland Industrial Supply B.V.',
    slug: 'rijnland',
    country: 'NL',
    share: 0.7,
    seed: 101,
    locales: [['NL', 55], ['DE', 25], ['GB', 20]] as const,
    users: [['Sanne', 'M.', 'admin'], ['Jonas', 'K.', 'sales'], ['Lieke', 'D.', 'finance'], ['Tobias', 'R.', 'warehouse'], ['Imke', 'V.', 'sales'], ['Marek', 'W.', 'warehouse'], ['Hanna', 'B.', 'finance'], ['Daan', 'P.', 'sales']] as const,
    warehouses: [['AMS-01', 'Amsterdam main', 'Amsterdam', 'NL'], ['RTM-02', 'Rotterdam port', 'Rotterdam', 'NL'], ['DUS-01', 'Düsseldorf hub', 'Düsseldorf', 'DE'], ['ANT-03', 'Antwerp overflow', 'Antwerp', 'BE']] as const,
  },
  {
    id: 2,
    name: 'Nordlicht Werkzeuge GmbH',
    slug: 'nordlicht',
    country: 'DE',
    share: 0.3,
    seed: 202,
    locales: [['DE', 60], ['NL', 20], ['GB', 20]] as const,
    users: [['Katrin', 'L.', 'admin'], ['Felix', 'B.', 'sales'], ['Marie', 'S.', 'sales'], ['Jan', 'T.', 'finance'], ['Paul', 'W.', 'warehouse'], ['Lena', 'H.', 'warehouse']] as const,
    warehouses: [['HAM-01', 'Hamburg central', 'Hamburg', 'DE'], ['MUC-01', 'München depot', 'München', 'DE'], ['VIE-01', 'Vienna cross-dock', 'Vienna', 'AT']] as const,
  },
] as const
