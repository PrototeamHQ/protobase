// `@protobase/server/config-exports`: splits a config module into its resources, views and pages, apart from the main
// entry so `protobase doctor` reads a config folder without loading the server, with the resources Protobase adds.
export { configExports } from './resource-source'
export { builtInResources } from './built-in-resources'
export { webhooksModule } from './webhooks/table/webhooks-module'
export { workflowsModule } from './workflows/workflows-module'
// The tables users add, which doctor checks, scaffold leaves out and eject writes into code, read without loading the server.
export { userTableResources } from './user-tables/user-table-resources'
export type { CheckedDefinition } from './user-tables/check-definition'
export { definitionsSchema, userTablesSchema } from './user-tables/names'
export { ownedTableNames } from './user-tables/owned-definitions'
export { maxTextLength } from './user-tables/definition-resource'
