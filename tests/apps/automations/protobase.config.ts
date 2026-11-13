import { defineConfig } from '@protobase/config'

// The whole app, as one object; it grows as the app does. Its resources are found in config/. Its address and secret
// are Protobase's defaults, PROTOBASE_URL and PROTOBASE_SECRET (see .env.example).
export default defineConfig({
  auth: {
    // No defaultRole on purpose: every account is created with an explicit role (`protobase users create --role`).
    roles: ['admin'],
  },
  // Every user works in tenant 1, which access rules can compare with an organization_id column.
  authenticate: { tenant: 1 },
  // Workflows on, with their jobs: build, test-run and publish them on the Workflows page. Their traces and stored
  // files stay in this folder's data/ directory.
  workflows: {},
})
