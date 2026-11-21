import type { BetterAuthPlugin } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { slugForName, slugSuffix } from './slug-of-name'

const createPath = '/organization/create'

// A create that names the organization and leaves its slug out.
const leavesSlugOut = (path: string | undefined, body: unknown) => {
  if (path !== createPath || typeof body !== 'object' || body === null) return false
  const { name, slug } = body as { name?: unknown; slug?: unknown }
  return typeof name === 'string' && slug === undefined
}

/**
 * Lets `POST /organization/create` take the name alone, trimmed: the slug comes from the name, with a random suffix when an
 * organization has that slug already (`slugForName`). One lookup by the slug's unique index decides; two creates that
 * race for one slug leave the second refused as Better Auth refuses a taken slug.
 */
export const derivedSlugPlugin = () =>
  ({
    id: 'protobase-organization-slug',
    hooks: {
      before: [
        {
          matcher: (context) => leavesSlugOut(context.path, context.body),
          handler: createAuthMiddleware(async (ctx) => {
            const name = (ctx.body as { name: string }).name.trim()
            const taken = async (slug: string) => Boolean(await ctx.context.adapter.findOne({ model: 'organization', where: [{ field: 'slug', value: slug }] }))
            const slug = await slugForName(name, taken, slugSuffix())
            return { context: { body: { ...ctx.body, name, slug } } }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
