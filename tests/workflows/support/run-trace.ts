import { readFile } from 'node:fs/promises'
import { sql, type Kysely } from 'kysely'
import { expect, vi } from 'vitest'
import { localFiles } from '@protobase/server/internal'
import { tempDir } from '../../../packages/server/src/files/testing/temp-dir'

/** A step of a run's trace, as the runner wrote it. */
export type TraceStep = Record<string, unknown> & { state: string; scope: string; seq: number; status: string; logs: { message: string }[] }

/**
 * A private file provider in a folder of its own, where runs keep their traces, as the app's `files`, and a reader of
 * a run's trace that waits for the run's last segment to write it, which it does in the background once the run ended.
 */
export const traceFiles = async () => {
  const folder = await tempDir()
  const files = { providers: { private: localFiles({ dir: folder.dir }) }, secret: 'files-secret-for-the-workflow-tests' }
  const steps = async (db: Kysely<any>, id: string): Promise<TraceStep[]> => {
    await vi.waitFor(async () => expect((await sql<{ trace_file: string | null }>`select trace_file from workflows.runs where id = ${id}`.execute(db)).rows[0]!.trace_file).toMatch(/^private:workflows\//), { timeout: 10_000, interval: 50 })
    const text = await readFile(`${folder.dir}/workflows/${id}/trace.jsonl`, 'utf8')
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as TraceStep)
  }
  // Every file the runs wrote, their traces included, as one text: for a check that no secret was kept.
  const everything = async () => {
    const { readdir } = await import('node:fs/promises')
    const names = await readdir(folder.dir, { recursive: true, withFileTypes: true })
    const texts = await Promise.all(names.filter((entry) => entry.isFile()).map((entry) => readFile(`${entry.parentPath}/${entry.name}`, 'utf8')))
    return texts.join('\n')
  }
  return { folder, files, steps, everything }
}
