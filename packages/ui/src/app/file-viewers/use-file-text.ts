import { useQuery } from '@tanstack/react-query'
import type { ViewedFile } from './file-viewer'

/** A file that could not be read, with the status its link answered. */
export class FileReadError extends Error {
  override name = 'FileReadError'
  constructor(readonly status: number) {
    super(`The file could not be read: its link answered ${status}`)
  }
}

/**
 * The text of a file a viewer shows, read once from its link and kept while the file is the same: a TanStack Query
 * result keyed by its stored `uri`, as the link changes each time it is signed. Parse JSON from `data` yourself.
 */
export const useFileText = (file: ViewedFile) =>
  useQuery({
    queryKey: ['file-text', file.uri],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch(file.url)
      if (!response.ok) throw new FileReadError(response.status)
      return response.text()
    },
  })
