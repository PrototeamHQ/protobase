import pg from 'pg'
import postgres from 'postgres'
import { jsonArrayFrom } from 'kysely/helpers/postgres'
import { z } from 'zod'
import * as config from './resources'
export default { config, options: { found: [typeof pg.Pool, typeof postgres, typeof jsonArrayFrom, typeof z.object] } }