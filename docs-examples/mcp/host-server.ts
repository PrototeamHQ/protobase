import { defineTool, mcpApprovals, mcpHandler, mcpServer, notFound, type Authenticator, type BaseToolContext } from '@protobase/server'

// The host's own data: here a map, in a real host its own database or API.
const projects = new Map([[1, { id: 1, name: 'Website', owner: 'ann', archived: false }]])

// Shown to clients that read `securitySchemes`: each tool needs the person's sign-in.
const signedIn = { securitySchemes: [{ type: 'oauth2', scopes: ['mcp'] }] }

const ownProject = (id: unknown, userId: string | number) => {
  const project = projects.get(Number(id))
  if (!project || project.owner !== userId) throw notFound(`No project ${String(id)}`)
  return project
}

export const archiveProject = defineTool<BaseToolContext>({
  name: 'archive_project',
  title: 'Archive a project',
  description: 'Archives one of the person\'s projects.',
  parameters: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  annotations: { readOnlyHint: false, destructiveHint: false },
  _meta: signedIn,
  run: async (args, { session, approve }) => {
    const project = ownProject(args.id, session.user.id)
    const answer = await approve({ title: `Archive project "${project.name}"?`, approveLabel: 'Archive' })
    if (answer !== 'approved') return JSON.stringify({ archived: false })
    project.archived = true
    return JSON.stringify({ archived: true })
  },
})

const approvals = mcpApprovals()

/** The host's MCP endpoint, admitting the tokens `authenticate`, the host's own `Authenticator`, verifies. */
export const projectsEndpoint = (authenticate: Authenticator) =>
  mcpHandler({
    authenticate,
    resource: 'https://console.example.com/api/mcp',
    scope: 'mcp',
    server: (session) => mcpServer({ info: { name: 'Console', version: '1.0.0' }, tools: [archiveProject], context: { session }, report: console.error, approvals }),
  })
