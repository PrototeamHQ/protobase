import type { Command } from 'commander'

const out = (text: string) => process.stdout.write(text)

// The project's auth, and @protobase/server with it, is imported when a command runs.
const projectApi = async () => {
  const [{ organizationsApi }, { loadProjectAuth }] = await Promise.all([import('./api'), import('../users/load-auth')])
  return organizationsApi(await loadProjectAuth(process.cwd()))
}

// The auth store keeps a connection pool open, so the commands end the process themselves.
const finish = (code: number) => process.exit(code)

const organizationOption = (command: Command) => command.option('--organization <organization>', 'its slug or id (default: auth.organizations.default of the config)')

/** `--organization`, and `--all-organizations` for a command that can reach every organization. */
export const pinOptions = (command: Command) => organizationOption(command).option('--all-organizations', 'act on every organization', false)

const memberOptions = (command: Command) =>
  organizationOption(command)
    .argument('<email>')
    .option('--org-role <role>', 'owner, admin or member: who manages the organization')
    .option('--app-roles <roles>', 'app roles in this organization, comma separated (see `users roles`)')

export const registerOrganizations = (program: Command) => {
  const organizations = program.command('organizations').description('Manage the organizations of the project in the current directory (with `auth.organizations` in protobase.config.ts)')

  pinOptions(organizations.command('list').description('List the organization with its members and roles'))
    .action(async (opts) => {
      const { listOrganizationsCommand } = await import('./commands')
      await listOrganizationsCommand(await projectApi(), { organization: opts.organization, allOrganizations: opts.allOrganizations }, out)
      finish(0)
    })

  organizations
    .command('create')
    .description('Create an organization; its owner holds every app role')
    .argument('<name>')
    .requiredOption('--owner <email>', 'the user who owns it')
    .option('--slug <slug>', 'default: from the name')
    .option('--id <id>', 'keep an existing tenant value, for an app that ran as one organization')
    .option('--members <all>', '"all": every other user joins; their global roles move here, superusers become owners')
    .action(async (name: string, opts) => {
      const { createOrganizationCommand } = await import('./commands')
      await createOrganizationCommand(await projectApi(), { name, owner: opts.owner, slug: opts.slug, id: opts.id, members: opts.members }, out)
      finish(0)
    })

  memberOptions(organizations.command('add-member').description('Add a user to the organization (organization role member unless given)')).action(async (email: string, opts) => {
    const { addMemberCommand } = await import('./commands')
    await addMemberCommand(await projectApi(), { organization: opts.organization, email, orgRole: opts.orgRole, appRoles: opts.appRoles }, out)
    finish(0)
  })

  memberOptions(organizations.command('set-roles').description("Change a member's organization role, app roles, or both")).action(async (email: string, opts) => {
    const { setMemberRolesCommand } = await import('./commands')
    await setMemberRolesCommand(await projectApi(), { organization: opts.organization, email, orgRole: opts.orgRole, appRoles: opts.appRoles }, out)
    finish(0)
  })

  organizationOption(organizations.command('remove-member').description('Remove a member (refuses the last owner)'))
    .argument('<email>')
    .action(async (email: string, opts) => {
      const { removeMemberCommand } = await import('./commands')
      await removeMemberCommand(await projectApi(), { organization: opts.organization, email }, out)
      finish(0)
    })

  pinOptions(organizations.command('add-app-role').description("Give an app role to the organization's owners, for a role added after they were made"))
    .argument('<role>')
    .requiredOption('--to <owners>', '"owners"')
    .action(async (role: string, opts) => {
      const { addAppRoleCommand } = await import('./commands')
      await addAppRoleCommand(await projectApi(), { role, to: opts.to, organization: opts.organization, allOrganizations: opts.allOrganizations }, out)
      finish(0)
    })
}
