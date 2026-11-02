// `@protobase/server/config-exports`: splits a config module into its resources, views and pages, apart from the main
// entry so `protobase doctor` reads a config folder without loading the server, with the resources Protobase adds.
export { configExports } from './resource-source'
export { builtInResources } from './built-in-resources'
export { webhooksModule } from './webhooks/table/webhooks-module'
// The tables users add, which doctor checks and scaffold leaves out, read without loading the server.
export { userTableResources } from './user-tables/user-table-resources'
export { definitionsSchema, userTablesSchema } from './user-tables/names'
