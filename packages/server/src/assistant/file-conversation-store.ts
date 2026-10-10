import type { ConversationRecord, ConversationStore } from './conversation-store'

// Loaded on first use, so the server still starts where there is no file system.
const fs = () => import('node:fs/promises')

const missing = (error: unknown) => error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'

// Owners and ids become single path segments that can never climb out of the directory.
const segment = (name: string) => encodeURIComponent(name).replaceAll('.', '%2E')

const extension = '.jsonl'

/**
 * Conversations as files: `<directory>/<owner>/<id>.jsonl`, one record per line, appended as the chat goes on. A
 * relative directory is resolved against the working directory; it is made on the first append.
 */
export const fileConversationStore = (directory: string): ConversationStore => {
  const folder = (owner: string) => `${directory}/${segment(owner)}`
  const file = (owner: string, id: string) => `${folder(owner)}/${segment(id)}${extension}`
  return {
    load: async (owner, id) => {
      const text = await (await fs()).readFile(file(owner, id), 'utf8').catch((error: unknown) => {
        if (missing(error)) return ''
        throw error
      })
      // Every record ends its line, so a last line without one was cut off by a crash mid-write.
      return text.split('\n').slice(0, -1).map((line) => JSON.parse(line) as ConversationRecord)
    },
    append: async (owner, id, records) => {
      if (records.length === 0) return
      const { appendFile, mkdir } = await fs()
      await mkdir(folder(owner), { recursive: true })
      await appendFile(file(owner, id), records.map((record) => `${JSON.stringify(record)}\n`).join(''))
    },
    list: async (owner) => {
      const { readdir, stat } = await fs()
      const names = await readdir(folder(owner)).catch((error: unknown) => {
        if (missing(error)) return []
        throw error
      })
      const conversations = await Promise.all(
        names.filter((name) => name.endsWith(extension)).map(async (name) => ({ id: decodeURIComponent(name.slice(0, -extension.length)), updatedAt: (await stat(`${folder(owner)}/${name}`)).mtime })),
      )
      return conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    },
  }
}
