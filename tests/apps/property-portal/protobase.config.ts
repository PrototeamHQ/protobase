import { defineConfig } from '@protobase/config'

// The whole portal, as one object. Its code is found by its path: resources in config/, roles in config/roles.ts, each
// job's run in jobs/<name>.ts and the auth emails' templates in emails/. Its address and secret are Protobase's
// defaults, PROTOBASE_URL and PROTOBASE_SECRET (see .env.example).
export default defineConfig({
  auth: {
    // Anyone makes their own account from the sign-in page, as a member, once a code mailed to their address proves it is
    // theirs; admins are made on the host (`protobase users create --role admin`).
    roles: ['admin', 'member'],
    // `protobase users create` without `--role` makes a member too.
    defaultRole: 'member',
    signUp: { role: 'member' },
  },
  jobs: {
    // Enqueued by Postgres when a listing is published (db/migrations/005_listing_published.sql).
    'match-listing': {
      description: 'Records an alert for each saved search a newly published listing fits, and mails those of searches that mail at once.',
      arguments: { listingId: 'integer' },
    },
    'email-alerts': {
      description: "Mails a member the alerts due for mail of their searches with this frequency, in one message, then marks them mailed.",
      arguments: { userId: { type: 'text', min: 1 }, frequency: { type: 'enum', values: ['instant', 'daily'] } },
      retryDelay: '1 minute',
    },
    'daily-alerts': {
      description: 'Every morning at 7 in Amsterdam: a digest for each member whose daily searches found listings due for mail.',
      schedule: '0 7 * * *',
      timezone: 'Europe/Amsterdam',
    },
  },
  // sharp makes the listing photos' variants and placeholders.
  files: { images: 'sharp' },
  // The maps draw PROTOBASE_MAP_STYLE_URL and switch to aerial photos.
  maps: {
    // The aerial photos the maps' switch offers, both open data under CC BY 4.0, free and without a key. Each covers its
    // own country; elsewhere the default map shows through. The URLs and terms are in the README's map section.
    layers: [
      {
        id: 'aerial_nl',
        label: 'Aerial (NL)',
        tiles: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
        attribution: 'Luchtfoto <a href="https://www.beeldmateriaal.nl/">Beeldmateriaal Nederland</a>, CC BY 4.0, via <a href="https://www.pdok.nl/">PDOK</a>',
        bounds: [3.2, 50.7, 7.3, 53.7],
        maxzoom: 21,
      },
      {
        id: 'aerial_es',
        label: 'Aerial (ES)',
        tiles: 'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}',
        attribution: '<a href="https://www.scne.es/">PNOA CC BY 4.0 scne.es</a>',
        bounds: [-18.4, 27.5, 4.6, 44.0],
        maxzoom: 20,
      },
    ],
  },
})
