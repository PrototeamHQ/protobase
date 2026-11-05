export type Fetch = typeof fetch
export const call = (send: typeof fetch) => send('https://example.com')
