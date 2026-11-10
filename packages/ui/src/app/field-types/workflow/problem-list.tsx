import { CircleAlert, TriangleAlert } from 'lucide-react'
import { isMissing, type NodeProblem } from './problems'
import { text } from './messages'

/** What the check says is wrong, each with the field it is about: a save is refused until none is left. */
export const ProblemList = ({ problems }: { problems: readonly NodeProblem[] }) =>
  problems.length > 0 && (
    <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-body text-danger-text">
      <p className="flex items-center gap-1.5 font-medium">
        <CircleAlert className="size-4" aria-hidden="true" />
        {problems.every(isMissing) ? text('fillInToSave', { count: problems.length }) : text('cannotSave', { count: problems.length })}
      </p>
      <ul className="mt-1 list-disc pl-6">
        {problems.map((problem, index) => (
          <li key={index}>{problem.field ? text('fieldProblem', { field: problem.field, message: problem.message }) : problem.message}</li>
        ))}
      </ul>
    </div>
  )

/** What the check warns of, each with the field it is about: a save goes through with them. */
export const WarningList = ({ warnings }: { warnings: readonly NodeProblem[] }) =>
  warnings.length > 0 && (
    <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-body text-warning-text">
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlert className="size-4" aria-hidden="true" />
        {text('warningsSaveAnyway', { count: warnings.length })}
      </p>
      <ul className="mt-1 list-disc pl-6">
        {warnings.map((warning, index) => (
          <li key={index}>{warning.field ? text('fieldProblem', { field: warning.field, message: warning.message }) : warning.message}</li>
        ))}
      </ul>
    </div>
  )
