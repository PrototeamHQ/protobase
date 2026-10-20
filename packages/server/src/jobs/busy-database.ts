import type { Db as BossDb } from 'pg-boss'

/** pg-boss's database, counting its statements under way: `idle()` says whether none is, such as a worker's fetch. */
export const busyDatabase = (database: BossDb) => {
  let running = 0
  const db: BossDb = {
    executeSql: async (text, values) => {
      running++
      try {
        return await database.executeSql(text, values)
      } finally {
        running--
      }
    },
  }
  return { db, idle: () => running === 0 }
}
