import type { ComponentType } from 'react'
import { isStoredFile } from '../../live/file-values'

/** A stored file a viewer shows: its name, media type and size, the link that downloads it, and its stored `uri`. */
export type ViewedFile = { uri: string; name: string; type: string; size?: number; url: string }

/** A sibling of the viewed file, with the key of the record that holds it and its file field, its viewer's address. */
export type SiblingFile = ViewedFile & { key: string | number | (string | number)[]; field: string }

/**
 * What a file viewer gets: the file, and its siblings, the other files of its record and of the records of its resource
 * that point at the same records, which `fileNamed` finds by the name the file refers to them by.
 */
export type FileViewerProps = {
  file: ViewedFile
  siblings: SiblingFile[]
}

/**
 * A viewer a plugin registers for a media type in `definePlugin({ fileViewers: { 'application/vnd.example.report+json':
 * { component } } })`: a file field's link to a file of that type opens `component` on the record's address
 * (`?file=<field>`), in place of a download. It reads the file itself, such as with `useFileText(file)`; when it
 * throws, the page offers the download instead.
 */
export type FileViewer = {
  component: ComponentType<FileViewerProps>
}

/** A file field's value as a viewer gets it; `undefined` for an empty, missing or unlinked one. */
export const viewedFile = (value: unknown): ViewedFile | undefined => {
  if (!isStoredFile(value) || 'missing' in value || !value.url) return
  return { uri: value.uri, name: value.name, type: value.type, url: value.url, ...(value.size !== undefined && { size: value.size }) }
}

/** The viewer registered for a file's media type, if any. */
export const viewerFor = (viewers: Readonly<Record<string, FileViewer>> | undefined, type: string) =>
  viewers && Object.hasOwn(viewers, type) ? viewers[type] : undefined

/**
 * The sibling a file refers to by `reference`, such as an image's `shots/before.png` in a markdown body: the one named as
 * its last path segment, after any query or fragment; `undefined` for an absolute address or a name no sibling has.
 */
export const fileNamed = <File extends ViewedFile>(siblings: readonly File[], reference: string) => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('/') || reference.startsWith('#')) return
  const path = reference.split(/[?#]/, 1)[0]!
  const name = path.slice(path.lastIndexOf('/') + 1)
  return siblings.find((sibling) => sibling.name === name)
}
