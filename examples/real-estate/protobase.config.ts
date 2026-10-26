import { defineConfig } from '@protobase/config'

// The whole app, as one object. Its code is found by its path: resources in config/, roles in config/roles.ts and the
// auth hooks in auth/hooks.ts. Its address and secret are Protobase's defaults, PROTOBASE_URL and PROTOBASE_SECRET (see
// .env.example).
export default defineConfig({
  auth: {
    // No defaultRole on purpose: every account is created with an explicit role (`protobase users create --role`).
    // New users take their ids from the app's own users sequence (auth/hooks.ts).
    roles: ['admin', 'manager', 'finance', 'maintenance'],
  },
  // Organizations are not used yet: everyone works in organization 1.
  authenticate: { tenant: 1 },
})
