import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { objectKey, storageProvider, storeUsage } from '@protobase/server'
import { connect } from '../db/connect'
import { importState } from './import-state'
import { inParallel } from './in-parallel'
import { projectFilesOptions } from './project-files'
import { copyObject } from './storage-copy'
import { supabaseDownload, type Download, type StorageSource } from './storage-download'
import { storageObjects } from './storage-objects'
import { storageReport } from './storage-report'
import { bucketLines, megabytes, objectCount, overQuota, totalBytes } from './storage-sizes'
import { alreadyCopied } from './storage-verify'

export type StorageOptions = { targetUrl: string; projectDir: string; source: StorageSource; yes: boolean }

/** Objects copied at once: enough to keep a connection busy, few enough for any host. */
const parallel = 4

/**
 * Copies the bytes of every object the load restored to `storage.objects` from the Supabase project into the app's
 * Storage file provider, streaming each, and checks each copy. Objects already in the provider are skipped, so a rerun
 * resumes; a failed object does not stop the rest, and the run fails at the end, listing them in the storage report.
 * It stops first when the bytes to copy exceed the provider's quota, unless `yes`.
 */
export const runStorageCopy = async (options: StorageOptions, out: (text: string) => void, download: Download = supabaseDownload(options.source)) => {
  const state = importState(options.projectDir)
  const { name, provider } = storageProvider(await projectFilesOptions(options.projectDir), process.env)
  const sql = connect(options.targetUrl)
  const objects = await storageObjects(sql).finally(() => sql.end())
  out(`Supabase Storage holds ${objectCount(objects.length)}, ${megabytes(totalBytes(objects))}:\n${bucketLines(objects).join('')}`)

  const stored = await inParallel(objects, parallel, async (object) => (await provider.store.head(await objectKey(object.bucket, object.name, object.version)))?.size)
  const todo = objects.filter((object, index) => !alreadyCopied(object, stored[index]))
  const over = provider.maxBytes === undefined ? undefined : overQuota(totalBytes(todo), (await storeUsage(provider.store)).bytes, provider.maxBytes)
  if (over && !options.yes) throw new Error(over)
  out(`copying ${objectCount(todo.length)}, ${megabytes(totalBytes(todo))}, into the file provider ${name}; ${objects.length - todo.length} are there already\n`)

  const outcomes = await inParallel(todo, parallel, (object) => copyObject(download, provider.store, object))
  const failed = outcomes.filter((outcome) => outcome.fault)
  await writeFile(state.storage, storageReport(options.source.url, name, objects, outcomes), { mode: 0o600 })
  const report = path.relative(options.projectDir, state.storage)
  if (failed.length > 0) throw new Error(`${failed.length} of ${objectCount(todo.length)} did not copy, listed in ${report}; run the command again to retry them`)
  out(`copied ${objectCount(todo.length)}; each byte count matches the source. Wrote ${report}\n`)
}
