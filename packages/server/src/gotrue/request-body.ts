import * as z from 'zod'
import { GoTrueError } from './errors'

/** An address as GoTrue takes it: trimmed and in lower case. */
export const address = z.string().trim().toLowerCase().pipe(z.email())

const parsedJson = (text: string): unknown => {
  try {
    return text ? JSON.parse(text) : {}
  } catch (error) {
    if (error instanceof SyntaxError) throw new GoTrueError(400, 'bad_json', 'Could not parse request body as JSON')
    throw error
  }
}

/** The request's JSON body as `schema` reads it; anything else is GoTrue's `validation_failed`, naming the field. */
export const readBody = async <S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> => {
  const result = schema.safeParse(parsedJson(await request.text()))
  if (result.success) return result.data
  const [issue] = result.error.issues
  throw new GoTrueError(400, 'validation_failed', issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'The request body is not valid')
}
