/** Bytes sent so far, of `total`. */
export type UploadProgress = (sent: number, total: number) => void

const headersOf = (raw: string) =>
  new Headers(raw.trim().split(/[\r\n]+/).filter(Boolean).map((line): [string, string] => {
    const colon = line.indexOf(':')
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
  }))

/**
 * A `fetch` that reports upload progress, through XMLHttpRequest since fetch cannot. It answers with an ordinary
 * Response; a network failure rejects with a TypeError, as fetch does.
 */
export const fetchWithProgress = (onProgress: UploadProgress): typeof fetch => (input, init = {}) =>
  new Promise<Response>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(init.method ?? 'GET', String(input))
    new Headers(init.headers).forEach((value, name) => request.setRequestHeader(name, value))
    request.responseType = 'blob'
    request.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : event.loaded)
    request.onload = () => {
      const empty = request.status === 204 || request.status === 304
      resolve(new Response(empty ? null : (request.response as Blob), { status: request.status, statusText: request.statusText, headers: headersOf(request.getAllResponseHeaders()) }))
    }
    request.onerror = () => reject(new TypeError('Network request failed'))
    request.onabort = () => reject(new DOMException('The upload was aborted', 'AbortError'))
    init.signal?.addEventListener('abort', () => request.abort())
    request.send(init.body as XMLHttpRequestBodyInit | null)
  })
