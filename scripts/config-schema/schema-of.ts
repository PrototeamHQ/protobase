import ts from 'typescript'

// A JSON Schema of a TypeScript type that holds plain data, as protobase.config.json can: functions, class instances
// and other values JSON cannot write are left out, and every value may be an `$env` value instead.

export type Schema = Record<string, unknown>

const envRef = { $ref: '#/definitions/EnvValue' }

/** `{ "$env": "NAME", "default": ..., "split": "," }`: a value read from the environment when the config is read. */
export const envValueSchema: Schema = {
  description: 'A value read from the environment variable `$env`: `default` when it is unset or empty, and with `split` the list of its non-empty parts.',
  type: 'object',
  properties: { $env: { type: 'string' }, default: {}, split: { type: 'string' } },
  required: ['$env'],
  additionalProperties: false,
}

/** The schemas of the types a program's checker gives, sharing the definitions of named types. */
export const schemaWriter = (program: ts.Program) => {
  const checker = program.getTypeChecker()
  const definitions: Record<string, Schema> = {}
  const named = new Map<ts.Type, string>()
  const inProgress = new Set<ts.Type>()

  const description = (symbol: ts.Symbol) => ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim()

  // A value JSON cannot write: a function, or an instance of a class of the standard library such as URL or Date.
  const isNonData = (type: ts.Type) => {
    if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) return true
    const symbol = type.getSymbol()
    if (!symbol || !(symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) || checker.isArrayType(type) || checker.isTupleType(type)) return false
    return (symbol.getDeclarations() ?? []).some((declaration) => program.isSourceFileDefaultLibrary(declaration.getSourceFile()))
  }

  // An object type of a dependency, such as Better Auth's social providers, which its own checks cover: any object.
  const isThirdParty = (type: ts.Type) => {
    const declarations = (type.aliasSymbol ?? type.getSymbol())?.getDeclarations() ?? []
    const outside = (file: ts.SourceFile) => file.fileName.includes('/node_modules/') && !program.isSourceFileDefaultLibrary(file)
    return declarations.length > 0 && declarations.every((declaration) => outside(declaration.getSourceFile()))
  }

  // A value position: the value's schema, or an $env value. `undefined` when JSON cannot write the value at all.
  const valueOf = (type: ts.Type): Schema | undefined => {
    const schema = schemaOf(type)
    if (!schema) return undefined
    if (Object.keys(schema).length === 0) return schema
    return { anyOf: [...(Object.keys(schema).length === 1 && Array.isArray(schema.anyOf) ? schema.anyOf : [schema]), envRef] }
  }

  const unionOf = (types: ts.Type[]): Schema | undefined => {
    const kept = types.filter((member) => !(member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)))
    const booleans = kept.filter((member) => member.flags & ts.TypeFlags.BooleanLiteral)
    const others = kept.filter((member) => !(member.flags & ts.TypeFlags.BooleanLiteral))
    const schemas = [...(booleans.length === 2 ? [{ type: 'boolean' }] : booleans.map(schemaOf)), ...others.map(schemaOf)].filter((schema): schema is Schema => schema !== undefined)
    if (schemas.some((schema) => Object.keys(schema).length === 0)) return {}
    const consts = schemas.filter((schema) => 'const' in schema)
    const rest = schemas.filter((schema) => !('const' in schema))
    const merged = [...(consts.length > 1 ? [{ enum: consts.map((schema) => schema.const) }] : consts), ...rest]
    if (merged.length === 0) return undefined
    return merged.length === 1 ? merged[0] : { anyOf: merged }
  }

  const objectOf = (type: ts.Type): Schema => {
    const properties: Record<string, Schema> = {}
    const required: string[] = []
    for (const property of checker.getPropertiesOfType(type)) {
      const value = valueOf(checker.getTypeOfSymbol(property))
      if (!value) continue
      const text = description(property)
      properties[property.name] = text ? { description: text, ...value } : value
      if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name)
    }
    const index = checker.getIndexInfosOfType(type).find((info) => info.keyType.flags & ts.TypeFlags.String)
    const additional = index ? valueOf(index.type) : undefined
    return {
      type: 'object',
      ...(Object.keys(properties).length > 0 && { properties }),
      ...(required.length > 0 && { required }),
      additionalProperties: additional ?? (index ? true : false),
    }
  }

  // A named type, such as an interface or a type alias without type arguments, becomes a definition.
  const nameOf = (type: ts.Type) => {
    if (type.aliasSymbol) return type.aliasTypeArguments?.length ? undefined : type.aliasSymbol.name
    const symbol = type.getSymbol()
    if (!symbol || symbol.name.startsWith('__') || !(symbol.flags & ts.SymbolFlags.Interface)) return undefined
    return (type as ts.TypeReference).typeArguments?.length ? undefined : symbol.name
  }

  // A type met again while its own schema is being written, as a recursive JSON value is, takes any value there.
  const schemaOf = (type: ts.Type): Schema | undefined => {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {}
    if (type.flags & ts.TypeFlags.Never) return undefined
    if (type.isStringLiteral() || type.isNumberLiteral()) return { const: type.value }
    if (type.flags & ts.TypeFlags.BooleanLiteral) return { const: checker.typeToString(type) === 'true' }
    if (type.flags & ts.TypeFlags.String || type.flags & ts.TypeFlags.TemplateLiteral) return { type: 'string' }
    if (type.flags & ts.TypeFlags.Number) return { type: 'number' }
    if (type.flags & ts.TypeFlags.Boolean) return { type: 'boolean' }
    if (type.flags & ts.TypeFlags.Null) return { type: 'null' }
    if (inProgress.has(type)) return {}
    inProgress.add(type)
    const schema = compositeOf(type)
    inProgress.delete(type)
    return schema
  }

  // A union, an array, a tuple or an object.
  const compositeOf = (type: ts.Type): Schema | undefined => {
    if (type.isUnion()) return unionOf(type.types)
    if (checker.isTupleType(type)) {
      const items = checker.getTypeArguments(type as ts.TypeReference).map((item) => valueOf(item) ?? {})
      return { type: 'array', items, minItems: items.length, maxItems: items.length }
    }
    if (checker.isArrayType(type)) {
      const item = valueOf(checker.getTypeArguments(type as ts.TypeReference)[0]!)
      return item ? { type: 'array', items: item } : undefined
    }
    if (!(type.flags & ts.TypeFlags.Object) && !type.isIntersection()) return {}
    if (isNonData(type)) return undefined
    if (isThirdParty(type)) return { type: 'object' }
    const name = nameOf(type)
    if (!name) return objectOf(type)
    const known = named.get(type)
    if (known) return { $ref: `#/definitions/${known}` }
    let key = name
    for (let n = 2; key in definitions; n++) key = `${name}${n}`
    named.set(type, key)
    definitions[key] = {}
    definitions[key] = objectOf(type)
    return { $ref: `#/definitions/${key}` }
  }

  return { schemaOf, definitions }
}
