export const locales = {
  NL: {
    stems: ['Polder', 'Rijnland', 'Kuststaal', 'Delta', 'Veluwe', 'Maasvallei', 'Tulpen', 'Grachten', 'Noordzee', 'Waterland', 'Brabant', 'Zeeuwse', 'Hollandse', 'Zuiderzee', 'Amstel', 'Vechtstreek', 'Gelderse', 'Friese'],
    nouns: ['Logistiek', 'Techniek', 'Verpakking', 'Installatie', 'Groothandel', 'Metaal', 'Bouwstoffen', 'Fietsen', 'Machinebouw', 'Transport', 'Scheepsbouw', 'Staalbouw', 'Elektro', 'Kunststof'],
    suffix: 'B.V.',
    cities: ['Rotterdam', 'Eindhoven', 'Utrecht', 'Zwolle', 'Breda', 'Groningen', 'Tilburg', 'Almere', 'Nijmegen', 'Arnhem', 'Enschede', 'Venlo'],
    surnames: ['de Vries', 'van den Berg', 'Bakker', 'Janssen', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Dijk', 'Dekker', 'Kok', 'Jacobs'],
    firstNames: ['Sanne', 'Daan', 'Lieke', 'Jeroen', 'Femke', 'Bram', 'Anouk', 'Ruben', 'Eva', 'Thijs', 'Noor', 'Pieter', 'Mirjam', 'Joost'],
    andWord: 'en Zonen',
    tld: 'nl',
    dial: '+31',
    vat: (n: number) => `NL${n}B01`,
  },
  DE: {
    stems: ['Nordlicht', 'Eifel', 'Rhein-Main', 'Schwarzwald', 'Hansa', 'Alpen', 'Elbe', 'Bergisch', 'Ruhr', 'Isar', 'Saar', 'Harz', 'Bodensee', 'Franken', 'Westfalen', 'Mosel'],
    nouns: ['Werkzeuge', 'Präzision', 'Maschinenbau', 'Handel', 'Elektro', 'Logistik', 'Verpackung', 'Systemtechnik', 'Metallbau', 'Antriebstechnik', 'Industriebedarf', 'Hydraulik', 'Kunststofftechnik'],
    suffix: 'GmbH',
    cities: ['Düsseldorf', 'Köln', 'Stuttgart', 'Hamburg', 'Münster', 'Nürnberg', 'Dortmund', 'Bremen', 'Hannover', 'Leipzig', 'Essen', 'Mannheim'],
    surnames: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun'],
    firstNames: ['Lena', 'Felix', 'Marie', 'Jan', 'Katrin', 'Paul', 'Julia', 'Lukas', 'Anna', 'Moritz', 'Sabine', 'Stefan', 'Heike', 'Matthias'],
    andWord: 'und Söhne',
    tld: 'de',
    dial: '+49',
    vat: (n: number) => `DE${n}`,
  },
  GB: {
    stems: ['Brightwater', 'Ironbridge', 'Harbour Street', 'Kestrel', 'Northgate', 'Oakfield', 'Redwood', 'Stonebridge', 'Millbrook', 'Ashford', 'Pennine', 'Thornbury', 'Greenway', 'Hartley'],
    nouns: ['Trading', 'Supplies', 'Engineering', 'Fabrication', 'Distribution', 'Packaging', 'Industrial', 'Components', 'Tooling', 'Hydraulics', 'Fasteners'],
    suffix: 'Ltd',
    cities: ['Leeds', 'Bristol', 'Birmingham', 'Manchester', 'Sheffield', 'Nottingham', 'Liverpool', 'Newcastle', 'Cardiff', 'Coventry'],
    surnames: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'Hughes', 'Harrison', 'Clarke', 'Bennett', 'Hall'],
    firstNames: ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Ava', 'Jack', 'Emily', 'Thomas', 'Grace', 'James', 'Charlotte', 'William', 'Poppy'],
    andWord: '& Sons',
    tld: 'co.uk',
    dial: '+44',
    vat: (n: number) => `GB${n}`,
  },
} as const

export type LocaleCode = keyof typeof locales

export const qualifiers = ['Holding', 'Group', 'International', 'Benelux', 'Europe', 'Services', 'Solutions']

export const jobTitles = ['Purchasing manager', 'Buyer', 'Operations manager', 'Warehouse lead', 'Finance controller', 'Owner', 'Procurement specialist', 'Logistics coordinator', 'Maintenance engineer', 'Office manager']
