import postgres from 'postgres'
import { forceSetting } from '@protobase/server/internal'
import { readCatalog } from './catalog'
import { contractions } from './contractions'

/** A section of a migration, by the name its part goes by, and what it takes from older code. */
export type SectionContractions = { name: string; found: string[] }

// Thrown to roll the trial back once it has read what it needs.
const rolledBack = Symbol('rolled back')

// The longest the trial waits for a lock another session holds, such as a running dev server's.
const lockTimeout = '10s'

// Postgres's code for a lock that was not granted within lock_timeout.
const lockNotAvailable = '55P03'

/**
 * Applies `sections` to the database at `url` in one transaction it rolls back, reading its schema before them and
 * after each, so nothing changes: what the whole file takes from older code, each line under the sections that take
 * it. Sections that take nothing are
 * left out.
 */
export const trialContractions = async (url: string, sections: readonly { name: string; text: string }[]): Promise<SectionContractions[]> => {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  const found: SectionContractions[] = []
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local lock_timeout = '${lockTimeout}'`)
      // The check of a kept module on again was asked already, and is not what the trial reads.
      await tx.unsafe(`select set_config('${forceSetting}', 'true', true)`)
      const before = await readCatalog(tx)
      // What each section takes from the schema the one before it left, and from the schema before the file. A line
      // of the whole file goes under every section that took it itself, so a later section that changes what an
      // earlier one made is named too; one no section took alone, such as a column dropped by one and added again
      // by another, goes under the first section after which the file had it.
      const own: string[][] = []
      const sinceStart: string[][] = []
      let previous = before
      for (const section of sections) {
        await tx.unsafe(section.text)
        const now = await readCatalog(tx)
        own.push(contractions(previous, now))
        sinceStart.push(contractions(before, now))
        previous = now
      }
      const whole = sinceStart.at(-1) ?? []
      const firstAt = (line: string) => sinceStart.findIndex((lines) => lines.includes(line))
      sections.forEach(({ name }, index) => {
        const lines = whole.filter((line) => own[index]!.includes(line) || (!own.some((lines) => lines.includes(line)) && firstAt(line) === index))
        if (lines.length > 0) found.push({ name, found: lines })
      })
      throw rolledBack
    })
  } catch (error) {
    if (error === rolledBack) return found
    if (!(error instanceof postgres.PostgresError)) throw error
    const reason = error.code === lockNotAvailable ? 'another session held a lock it needs for longer than ' + lockTimeout : `Postgres refused it (${error.code})`
    throw new Error(`The migration was applied to DATABASE_URL and rolled back, to read what it changes, and failed: ${reason}. Apply the project's migrations to the database first and stop what holds its locks, or unset DATABASE_URL to write only the auth store's steps`, { cause: error })
  } finally {
    await sql.end()
  }
  throw new Error('Not implemented: the trial transaction ends by rolling back')
}
