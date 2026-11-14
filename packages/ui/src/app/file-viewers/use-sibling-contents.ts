import { useQueries } from '@tanstack/react-query'
import { useResourceClient } from '../../data/api-provider'
import type { ViewedFile } from './file-viewer'
import { FileReadError } from './use-file-text'
import { useViewedResource } from './viewed-resource'

// The bytes as a `data:` URL of the file's own type: a sandboxed page cannot load the app's `blob:` URLs, and the URL
// holds the bytes alone, no signed link that would open the file elsewhere.
const dataUrl = (bytes: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(bytes)
  })

/**
 * The contents of `files` as `data:` URLs by their stored `uri`, each read once from the API that serves the viewed
 * record, with the user's own rights, as `useFileText` reads, up to 10 MB each; `ready` once every read has answered. A
 * file that could not be read is left out, so what refers to it stays as written.
 */
export const useSiblingContents = (files: readonly ViewedFile[]) => {
  const resource = useViewedResource()
  const client = useResourceClient(resource)
  const reads = useQueries({
    queries: files.map((file) => ({
      queryKey: ['file-data-url', resource, file.uri],
      staleTime: Infinity,
      retry: false,
      queryFn: async () => {
        const response = await fetch(client.fileReadUrl(resource, file))
        if (!response.ok) throw new FileReadError(response.status)
        return dataUrl(new Blob([await response.arrayBuffer()], { type: file.type }))
      },
    })),
  })
  const contents = new Map<string, string>()
  reads.forEach((read, index) => read.data !== undefined && contents.set(files[index]!.uri, read.data))
  return { contents, ready: reads.every((read) => !read.isPending) }
}
