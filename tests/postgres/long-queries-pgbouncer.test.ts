import { describe } from 'vitest'
import { longQueryScenarios } from '../../packages/cli/tests/serve/long-queries-scenarios'
import { databaseUrl, poolerReachable, poolerUrl } from '../../scripts/test-db/templates'
import { postgresTemplateReady } from '../../test-support/postgres-database'

// Through PgBouncer in transaction mode as the cloud runs it, which tracks statement_timeout: the connection kept for
// long queries asks for its limit when it logs in, and the app's other connections keep the role's on the same server
// connections.
describe.skipIf(!(await postgresTemplateReady('empty')) || !(await poolerReachable()))('the limits of the queries protobase serve runs, through PgBouncer', () => {
  longQueryScenarios((database) => databaseUrl(database, poolerUrl))
})
