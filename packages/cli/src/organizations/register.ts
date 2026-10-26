import type { Command } from 'commander'
import { addAppRoleCommand, addMemberCommand, createOrganizationCommand, listOrganizationsCommand, removeMemberCommand, setMemberRolesCommand } from './commands'

const out = (text: string) => process.stdout.write(text)

// The project's auth, and @protobase/server with it, is imported when a command runs.
const projectApi = async () => {
  const [{ organizationsApi }, { loadProjectAuth }] = await Promise.all([import('./api'), import('../users/load-auth')])
  return organizationsApi(await loadProjectAuth(process.cwd()))
}

// The auth store keeps a connection pool open, so the commands end the process themselves.
const finish = (code: number) => process.exit(code)

const memberOptions = (command: Command) =>
  command
    .argument('<organization>', 'its slug or id')
    .argument('<email>')
    .option('--org-role <role>', 'owner, admin or member: who manages the organization')
    .option('--app-roles <roles>', 'app roles in this organization, comma separated (see `users roles`)')

export const registerOrganizations = (program: Command) => {
  const organizations = program.command('organizations').description('Manage the organizations of the project in the current directory (with `organizations` in createAuth)')

  organizations
    .command('list')
    .description('List organizations with their members and roles')
    .action(async () => {
      await listOrganizationsCommand(await projectApi(), out)
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
      await createOrganizationCommand(await projectApi(), { name, owner: opts.owner, slug: opts.slug, id: opts.id, members: opts.members }, out)
      finish(0)
    })

  memberOptions(organizations.command('add-member').description('Add a user to an organization (organization role member unless given)')).action(async (organization: string, email: string, opts) => {
    await addMemberCommand(await projectApi(), { organization, email, orgRole: opts.orgRole, appRoles: opts.appRoles }, out)
    finish(0)
  })

  memberOptions(organizations.command('set-roles').description("Change a member's organization role, app roles, or both")).action(async (organization: string, email: string, opts) => {
    await setMemberRolesCommand(await projectApi(), { organization, email, orgRole: opts.orgRole, appRoles: opts.appRoles }, out)
    finish(0)
  })

  organizations
    .command('remove-member')
    .description('Remove a member (refuses the last owner)')
    .argument('<organization>', 'its slug or id')
    .argument('<email>')
    .action(async (organization: string, email: string) => {
      await removeMemberCommand(await projectApi(), { organization, email }, out)
      finish(0)
    })

  organizations
    .command('add-app-role')
    .description('Give an app role to every owner of every organization, for a role added after they were made')
    .argument('<role>')
    .requiredOption('--to <owners>', '"owners"')
    .action(async (role: string, opts) => {
      await addAppRoleCommand(await projectApi(), { role, to: opts.to }, out)
      finish(0)
    })
}
