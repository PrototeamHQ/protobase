/** `fetch` refused the URL before sending: its scheme, or a host that is not a public address. Names the host only. */
export class AddressRefusedError extends Error {
  override name = 'AddressRefusedError'
}

/** The answer's body is longer than the `maxBytes` `fetch` reads. */
export class ResponseTooLargeError extends Error {
  override name = 'ResponseTooLargeError'
  constructor(readonly maxBytes: number) {
    super(`The answer's body is longer than ${maxBytes} bytes`)
  }
}

/** The most a plugin's `fetch` reads of a body, and its default. */
export const fetchMaxBytes = 10 * 1024 * 1024
