export const run = async (context: { fetch: (url: string) => Promise<Response> }) => {
  const { fetch } = context
  await context.fetch('https://a.example')
  return fetch('https://b.example')
}
