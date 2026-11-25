import { everyOrganization as every } from '@protobase/query'

// everyOrganization('in a comment') is no use.
export const everyOrganization = (reason: string) => ({ reason })

export const scopes = [every('the host acts in every organization'), everyOrganization('a nightly sweep')]
