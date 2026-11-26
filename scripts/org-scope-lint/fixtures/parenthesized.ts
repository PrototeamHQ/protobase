import { acrossOrganizations, acrossOrganizations as across } from '../../../packages/server/src/organization-scope/sign-in-organization'

export const reads = (work: () => number) => [(acrossOrganizations)('a parenthesized call', work), ((across))('a parenthesized alias', work)]
