import { quoteIdent } from '../changes/capture-sql'
import { stepCacheSql } from './cache/step-cache-sql'
import { revocationsSql } from './connections/revocations-sql'
import { blockRunsSql } from './block-runs-sql'
import { hooksSql } from './hooks/hooks-sql'
import { checkpointsSql, definitionPartsSql, droppedSql, effectsSql, functionsTablesSql, indexesSql, layoutSql, tablesSql, triggersSql } from './schema-sql'
import { statusTablesSql } from './status-sql'
import { taskTokensSql } from './task-tokens-sql'
import { testRunsSql } from './test-runs-sql'

// Step 1 of `workflowsSchemaModule`, with each builder it calls: frozen once released, as every step is. A change to the
// tables is a step of its own.

/** The workflows' tables and indexes at version 28 of the schema, before it had steps. */
export const workflowsTablesSql = (schema: string) =>
  `${[
    `create schema if not exists ${quoteIdent(schema)}`,
    tablesSql(schema),
    definitionPartsSql(schema),
    layoutSql(schema),
    checkpointsSql(schema),
    droppedSql(schema),
    triggersSql(schema),
    effectsSql(schema),
    revocationsSql(schema),
    hooksSql(schema),
    stepCacheSql(schema),
    indexesSql(schema),
    blockRunsSql(schema),
    taskTokensSql(schema),
    testRunsSql(schema),
    functionsTablesSql(schema),
    statusTablesSql(schema),
  ].join(';\n\n')};`
