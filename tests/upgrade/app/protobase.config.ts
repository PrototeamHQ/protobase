// The app CI upgrades from the default branch's Protobase to a pull request's (tests/upgrade/upgrade.sh): every feature
// that keeps a schema of its own in the app's database is on, so a change to any of those schemas is upgraded. A
// feature added later that keeps one is turned on here too.
export default {
  url: 'http://localhost:5173',
  auth: {
    roles: { admin: 'Admin', editor: 'Editor' },
    organizations: true,
    personalAccessTokens: { prefix: 'upgrade_' },
  },
  webhooks: {},
  workflows: {},
  notifications: {},
  status: {},
  calls: { backend: { kind: 'peer' }, processes: 'many' },
  realtime: { processes: 'many', sqlSends: true },
  userTables: true,
}
