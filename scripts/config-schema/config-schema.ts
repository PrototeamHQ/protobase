import path from 'node:path'
import ts from 'typescript'
import { envValueSchema, schemaWriter, type Schema } from './schema-of'

const root = path.join(import.meta.dirname, '..', '..')
const configTypes = path.join(root, 'packages/config/src/config.ts')

/** Where the schema is published: in @protobase/config, beside the types it is made from. */
export const schemaFile = path.join(root, 'packages/config/schema.json')

/** The JSON Schema of protobase.config.json, made from `ProtobaseConfig` of @protobase/config. */
export const configSchema = () => {
  const { config } = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root)
  const program = ts.createProgram([configTypes], options)
  const checker = program.getTypeChecker()
  const exported = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(configTypes)!)!)
  const symbol = exported.find((entry) => entry.name === 'ProtobaseConfig')
  if (!symbol) throw new Error(`${configTypes} exports no ProtobaseConfig`)
  const { schemaOf, definitions } = schemaWriter(program)
  const ref = schemaOf(checker.getDeclaredTypeOfSymbol(symbol))!.$ref as string
  const { ProtobaseConfig: top, ...rest } = definitions
  if (ref !== '#/definitions/ProtobaseConfig' || !top) throw new Error(`ProtobaseConfig became ${ref}`)
  const properties = top.properties as Record<string, Schema>
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'protobase.config.json',
    description: "A Protobase project's config, as protobase.config.ts's ProtobaseConfig types it: one flat object of plain data, everything optional.",
    ...top,
    properties: { $schema: { description: 'The JSON Schema this file follows, such as ./node_modules/@protobase/config/schema.json.', type: 'string' }, ...properties },
    definitions: { EnvValue: envValueSchema, ...rest },
  }
}

/** The schema as the file holds it. */
export const configSchemaText = () => `${JSON.stringify(configSchema(), null, 2)}\n`
