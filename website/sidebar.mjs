// The hand-written pages in the sidebar's order, which the site and the protobase skill (scripts/protobase-skill.ts) share.
// Getting started is the sidebar's first entry, outside any group.
export const gettingStarted = 'getting-started'

// The features page, which opens the Features group and links every area page below.
export const featuresPage = 'features'

// One page per area of the features page (features.md), each listing that area's features. scripts/features-check.ts
// holds every one of them to the entry grammar and refuses a page under features/ that is not here.
export const features = [
  'features/start-a-project',
  'features/data-model',
  'features/access',
  'features/lists',
  'features/list-displays',
  'features/record-pages',
  'features/actions',
  'features/composed-pages',
  'features/your-own-code',
  'features/look-and-language',
  'features/navigation',
  'features/rest-api',
  'features/api-functions',
  'features/sign-in-and-accounts',
  'features/files-and-images',
  'features/history-comments-and-live-updates',
  'features/events-webhooks-and-jobs',
  'features/notifications',
  'features/email-and-public-forms',
  'features/ai',
  'features/compatibility',
  'features/several-apps',
  'features/build-and-run',
  'features/releases',
]

export const guides = [
  'guides/existing-database',
  'guides/table-to-admin',
  'guides/first-composed-page',
  'guides/billing-page',
  'guides/api-functions',
  'guides/first-plugin',
  'guides/theme-an-app',
  'guides/field-type',
  'guides/record-card',
  'guides/plugin-build',
  'guides/remote-resources',
  'guides/export-a-list',
  'guides/import-records',
  'guides/push-notifications',
  'guides/create-page',
  'guides/personal-setting',
  'guides/mobile-app',
  'guides/deploy',
]

// The reference pages, grouped by the area of an app they work on. Each group is a collapsible group inside Reference.
export const referenceGroups = [
  {
    label: 'Project config',
    items: [
      'reference/config',
      'reference/config/app',
      'reference/config/sign-in',
      'reference/config/api',
      'reference/config/admin-app',
      'reference/config/jobs-and-events',
      'reference/config/files',
    ],
  },
  {
    label: 'Data',
    items: ['reference/data-config', 'reference/files', 'reference/history', 'reference/comments', 'reference/live', 'reference/ai'],
  },
  { label: 'Access and sign-in', items: ['reference/access', 'reference/auth'] },
  { label: 'API', items: ['reference/api', 'reference/client', 'reference/mcp'] },
  { label: 'Events and jobs', items: ['reference/events', 'reference/webhooks', 'reference/jobs'] },
  { label: 'Email, notifications and forms', items: ['reference/email', 'reference/notifications', 'reference/forms'] },
  {
    label: 'Admin UI',
    items: [
      'reference/ui-config',
      'reference/layouts',
      'reference/blocks',
      'reference/custom-components',
      'reference/plugins',
      'reference/remote-resources',
      'reference/assistant',
    ],
  },
  { label: 'Navigation', items: ['reference/sidebar', 'reference/user-menu', 'reference/bottom-bar'] },
  { label: 'Look and language', items: ['reference/theme', 'reference/app-identity', 'reference/languages', 'reference/installable-app'] },
  { label: 'Migrating to Protobase', items: ['reference/supabase-rest', 'reference/supabase-storage', 'reference/supabase-realtime'] },
  { label: 'Command line', items: ['reference/cli'] },
]

// Every reference page in sidebar order, for the protobase skill and the docs checks.
export const reference = referenceGroups.flatMap((group) => group.items)

// Pages that give background on how Protobase itself is built and released, rather than on building an app with it.
export const architecture = ['reference/architecture', 'reference/versioning']
