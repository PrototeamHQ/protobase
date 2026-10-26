import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { configSchemaText, schemaFile } from './config-schema'

// `bun run config:schema`: writes packages/config/schema.json again from ProtobaseConfig.
writeFileSync(schemaFile, configSchemaText())
console.log(`wrote ${path.relative(process.cwd(), schemaFile)}`)
