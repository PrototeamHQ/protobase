import { acrossOrganizations as across } from '../../../packages/server/src/organization-scope/sign-in-organization'
import * as scope from '../../../packages/server/src/organization-scope/sign-in-organization'

// acrossOrganizations('in a comment', work) is no use, nor is the string below.
const mention = "acrossOrganizations('in a string', work)"

export const acrossOrganizations = <Result>(reason: string, work: () => Result) => work()

export const reads = (work: () => number) => [across('a user lists their own memberships', work), scope.acrossOrganizations('tokens by hash', work), scope['acrossOrganizations']('a host superuser', work), mention]
