import { defineFunction } from '@protobase/server'

// GET /api/functions/hello: who is calling. Only a signed-in user gets here; anyone else gets a 401 problem.
export default defineFunction((_request, { session }) =>
  Response.json({ message: `Hello, ${session.user.id}`, roles: session.user.roles }),
)
