/** An answer to one of the `/api/sb/rest/v1` cases: what supabase-js reads of it. */
export type RecordedAnswer = { name: string; status: number; headers: Record<string, string>; body: unknown }

// supabase-js reads the count from Content-Range and the body by its Content-Type.
const kept = ['content-range', 'content-type']

export const recordedHeaders = (headers: Headers) =>
  Object.fromEntries(kept.flatMap((name) => {
    const value = headers.get(name)
    return value === null ? [] : [[name, value]]
  }))
