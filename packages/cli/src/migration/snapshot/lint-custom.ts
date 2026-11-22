import { createRequire } from 'node:module'
import { lintSteps } from '@protobase/server/internal'
import type { MigrationFile } from './migration-files'

// The tables a file makes, as its SQL names them, whose unique indexes need no check of rows already there.
const createTable = /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?((?:(?:"[^"]+"|\w+)\.)?(?:"[^"]+"|\w+))/gim

/**
 * What makes each hand-written migration marked additive unsafe to apply unattended, by the same lint as Protobase's
 * own steps (Squawk, with the rules `lintSteps` refuses). A hand-written one that is not marked counts as not additive
 * and is not linted.
 */
export const lintCustomFiles = (files: MigrationFile[]) => {
  const additive = files.filter(({ header }) => header?.custom && header.additive)
  if (additive.length === 0) return []
  const squawk = createRequire(import.meta.url).resolve('squawk-cli/js/bin/squawk')
  const steps = additive.map(({ file, text }) => ({ label: file, sql: text, made: [...text.matchAll(createTable)].map((match) => match[1]!), checked: false }))
  return lintSteps(steps, squawk).map(({ step, rule, message }) => `${step} is marked additive and breaks ${rule}: ${message}`)
}
