declare const fetch: (url: string) => Promise<unknown>
export const send = () => fetch('https://example.com')
