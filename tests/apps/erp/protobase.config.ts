import { defineConfig } from '@protobase/config'

// The whole app, as one object. Its code is found by its path: resources in config/, roles in config/roles.ts, each
// job's run in jobs/<name>.ts, each write hook in hooks/<name>.ts, the auth hooks in auth/hooks.ts and the API
// functions in functions/. Its address and secret are Protobase's defaults, PROTOBASE_URL and PROTOBASE_SECRET (see
// .env.example).
export default defineConfig({
  // The time zone of the jobs' schedules, such as the nightly overdue check.
  timezone: 'Europe/Amsterdam',
  auth: {
    // `admin` is the superuser, in every organization; the others are held per organization (or globally, by a few).
    roles: {
      admin: 'Superuser',
      auditor: 'Auditor',
      manager: { label: 'Manager', grants: ['sales', 'accountant', 'warehouse', 'editor'] },
      sales: 'Sales',
      accountant: 'Accountant',
      warehouse: 'Warehouse',
      editor: 'Editor',
      integration: 'Integration',
    },
    // New users and organizations take their ids from the ERP's own sequences (auth/hooks.ts).
    organizations: true,
  },
  jobs: {
    'mark-invoice-overdue': {
      description: 'An invoice still sent and unpaid once its due date has passed becomes overdue.',
      arguments: { invoiceId: 'bigint' },
    },
    'mark-overdue-invoices': {
      description: 'Every night, the sent invoices that passed their due date, such as imported ones that never had a check enqueued.',
      schedule: '0 2 * * *',
    },
  },
  // A sent invoice gets the check of its payment, in the write's own transaction.
  writeHooks: ['schedule-overdue-check'],
})
