import type { CopyOutcome } from './storage-copy'
import { megabytes, objectCount, totalBytes } from './storage-sizes'
import type { SourceObject } from './storage-objects'

const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ')

/**
 * `supabase-import/storage.md`: what the last copy of Storage's bytes did, from the Supabase project at `url`, into the
 * file provider `provider`, and each object that failed, which the next run tries again.
 */
export const storageReport = (url: string, provider: string, objects: SourceObject[], outcomes: CopyOutcome[]) => {
  const failed = outcomes.filter((outcome) => outcome.fault)
  const copied = outcomes.length - failed.length
  return [
    '# Supabase Storage copy\n',
    `From ${url} into the file provider \`${provider}\`: ${objectCount(objects.length)}, ${megabytes(totalBytes(objects))}. This run copied ${copied}, found ${objects.length - outcomes.length} copied already and failed ${failed.length}. Each copy's byte count matched the size Supabase recorded, and its MD5 the object's ETag where that is one.\n`,
    failed.length === 0
      ? '## Failed\n\nNone.\n'
      : `## Failed\n\nRun \`protobase import supabase --storage-url ${url}\` again to retry these.\n\n| Bucket | Object | Why |\n| --- | --- | --- |\n${failed.map(({ object, fault }) => `| ${cell(object.bucket)} | ${cell(object.name)} | ${cell(fault!)} |`).join('\n')}\n`,
  ].join('\n')
}
