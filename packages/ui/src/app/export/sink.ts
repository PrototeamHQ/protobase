import type { ExportFormat } from './builder'
import { text } from './messages'

/** Where an export's bytes go as they are built: `close` keeps the file, `abort` discards it. */
export type ExportSink = { write: (bytes: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }

const types = {
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx', description: 'workbook' },
  csv: { mime: 'text/csv', extension: '.csv', description: 'csvFile' },
} as const satisfies Record<ExportFormat, { mime: string; extension: string; description: string }>

// Characters a file name cannot hold on Windows or macOS.
const unsafeName = /[\\/:*?"<>|\u0000-\u001f]/g

/** The file's name: the resource's label and the day, such as `Orders 2026-10-16.xlsx`. */
export const exportFileName = (label: string, format: ExportFormat, now = new Date()) => {
  const day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
  return `${label.replace(unsafeName, ' ').trim()} ${day}${types[format].extension}`
}

// Joined into a Blob every few megabytes, which the browser may keep on disk, so the page holds little of the file.
const blobFlushBytes = 8_000_000

/** Collects the file in a Blob and downloads it under `name` once it is complete, for browsers without a save picker. */
export const createDownloadSink = (name: string, format: ExportFormat): ExportSink => {
  let blob = new Blob([], { type: types[format].mime })
  let pending: Uint8Array[] = []
  let pendingBytes = 0
  const flush = () => {
    blob = new Blob([blob, ...(pending as BlobPart[])], { type: types[format].mime })
    pending = []
    pendingBytes = 0
  }
  return {
    write: async (bytes) => {
      if (bytes.length === 0) return
      pending.push(bytes)
      pendingBytes += bytes.length
      if (pendingBytes >= blobFlushBytes) flush()
    },
    close: async () => {
      flush()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      // The download has its own copy once it starts.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
    abort: async () => {
      pending = []
      blob = new Blob([])
    },
  }
}

type SavePicker = (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle>

const savePicker = () => (globalThis as { showSaveFilePicker?: SavePicker }).showSaveFilePicker

/** Whether the browser can write the file to disk as it is built (the File System Access API). */
export const canSaveAsBuilt = () => typeof savePicker() === 'function'

/**
 * Asks where to save the file and writes it there as it is built, so the page holds none of it; `undefined` when the
 * user closes the picker. Call it from the click that starts the export, as the browser asks.
 */
export const pickFileSink = async (name: string, format: ExportFormat): Promise<ExportSink | undefined> => {
  const pick = savePicker()
  if (!pick) throw new Error('This browser cannot save a file as it is built')
  const type = types[format]
  let handle: FileSystemFileHandle
  try {
    handle = await pick({ suggestedName: name, types: [{ description: text(type.description), accept: { [type.mime]: [type.extension] } }] })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return undefined
    throw error
  }
  const writable = await handle.createWritable()
  return {
    write: async (bytes) => {
      if (bytes.length > 0) await writable.write(bytes as BufferSource)
    },
    close: () => writable.close(),
    abort: () => writable.abort(),
  }
}
