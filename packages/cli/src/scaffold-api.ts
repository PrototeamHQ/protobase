// `@protobase/cli/scaffold`: the scaffold command as functions, for `npm create protobase <database-url>`, which lists a
// database's tables, asks which become resources and scaffolds them into the project it writes, with that project's CLI.
export { listTables, type ScaffoldTable } from './scaffold/tables'
export { runScaffold, type ScaffoldOptions } from './scaffold/run'
export { asking } from './scaffold/prompt'
