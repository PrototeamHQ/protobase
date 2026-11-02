// `@protobase/server/config-exports`: splits a config module into its resources, views and pages, apart from the main
// entry so `protobase doctor` reads a config folder without loading the server, with the resources Protobase adds.
export { configExports } from './resource-source'
export { builtInResources } from './built-in-resources'
export { webhooksModule } from './webhooks/table/webhooks-module'
