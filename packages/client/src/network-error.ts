/** A request that got no answer, such as offline: fetch's own `TypeError`, told apart from a bug's. */
export class NetworkError extends TypeError {
  constructor(options?: { cause: unknown }) {
    super('The server could not be reached', options)
    this.name = 'NetworkError'
  }
}

/** `fetch`, rejecting with `NetworkError` where it rejects for want of an answer. */
export const reportingNoAnswer =
  (fetch: typeof globalThis.fetch): typeof globalThis.fetch =>
  async (input, init) => {
    try {
      return await fetch(input, init)
    } catch (failure) {
      if (failure instanceof TypeError) throw new NetworkError({ cause: failure })
      throw failure
    }
  }
