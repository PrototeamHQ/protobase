import { useQuery } from '@tanstack/react-query'
import { useResourceClient } from '../../data/api-provider'
import type { ViewedFile } from './file-viewer'
import { useViewedResource } from './viewed-resource'

/** A file that could not be read, with the status its link answered. */
export class FileReadError extends Error {
  override name = 'FileReadError'
  constructor(readonly status: number) {
    super(`The file could not be read: its link answered ${status}`)
  }
}

/**
 * The text of a file a viewer shows, read once and kept while the file is the same: a TanStack Query result keyed by
 * its resource and stored `uri`, as the link changes each time it is signed. Parse JSON from `data` yourself. It reads
 * from the API that serves the record, which sends the bytes itself whatever store holds them or wherever the file's
 * link points, up to 10 MB; a larger file fails with a 403.
 */
export const useFileText = (file: ViewedFile) => {
  const resource = useViewedResource()
  const client = useResourceClient(resource)
  return useQuery({
    queryKey: ['file-text', resource, file.uri],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch(client.fileReadUrl(file))
      if (!response.ok) throw new FileReadError(response.status)
      return response.text()
    },
  })
}
