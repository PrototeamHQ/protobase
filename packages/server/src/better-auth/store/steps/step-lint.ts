import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Whether a step is safe to apply unattended: it only adds a table, a nullable column, an index, or a column with a
// default. Squawk reads each step as a file of its own, so a table an earlier step made counts as one with rows; the
// tests run this over every step Protobase ships.

/**
 * The Squawk rules a step must not break, a step it cannot parse included. Its others are about locks and online
 * changes, which do not apply as the migrations run while nothing else writes, or about style.
 */
const refusedRules = [
  'syntax-error',
  'ban-drop-column',
  'ban-drop-table',
  'ban-drop-database',
  'ban-truncate-cascade',
  'changing-column-type',
  'adding-required-field',
  'adding-not-nullable-field',
  'disallowed-unique-constraint',
  'renaming-column',
  'renaming-table',
]

/** A rendered step: `made`, the tables it makes as its SQL names them; `checked`, whether it starts with a check. */
export type LintedStep = { label: string; sql: string; made: string[]; checked: boolean }

export type StepFinding = { step: string; rule: string; message: string }

const squawk = createRequire(import.meta.url).resolve('squawk-cli/js/bin/squawk')

type SquawkFinding = { file: string; rule_name: string; message: string }

const squawkFindings = (steps: LintedStep[]): StepFinding[] => {
  const dir = mkdtempSync(path.join(tmpdir(), 'protobase-step-lint-'))
  const files = steps.map((step, i) => {
    const file = path.join(dir, `${i}.sql`)
    writeFileSync(file, step.sql)
    return file
  })
  const run = spawnSync(process.execPath, [squawk, '--reporter', 'json', '--assume-in-transaction', ...files], { encoding: 'utf8' })
  rmSync(dir, { recursive: true })
  if (run.error) throw run.error
  if (run.stdout.trim() === '') throw new Error(`squawk exited with ${run.status}: ${run.stderr}`)
  return (JSON.parse(run.stdout) as SquawkFinding[])
    .filter((finding) => refusedRules.includes(finding.rule_name))
    .map((finding) => ({ step: steps[files.indexOf(finding.file)]!.label, rule: finding.rule_name, message: finding.message }))
}

// Keywords in any case and after any indentation; the table as the SQL writes it.
const uniqueIndexOn = /^\s*create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?(?:"[^"]+"|\w+)\s+on\s+((?:(?:"[^"]+"|\w+)\.)?(?:"[^"]+"|\w+))/gim

/** A unique index over the rows of a table the step did not make holds only when they are unique: the step checks that first. */
const uncheckedUniqueIndexes = (steps: LintedStep[]): StepFinding[] =>
  steps
    .filter((step) => !step.checked)
    .flatMap((step) =>
      [...step.sql.matchAll(uniqueIndexOn)]
        .filter((match) => !step.made.includes(match[1]!))
        .map((match) => ({ step: step.label, rule: 'unique-index-without-check', message: `a unique index on ${match[1]}, which has rows already, without a check that they are unique` })),
    )

/** What makes each step unsafe to apply unattended; none when every one is safe. */
export const lintSteps = (steps: LintedStep[]) => [...squawkFindings(steps), ...uncheckedUniqueIndexes(steps)]
