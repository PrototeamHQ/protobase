import { Plus, Trash2 } from 'lucide-react'
import type { ChoiceRule, ChoiceState } from '@protobase/workflows'
import { Button } from '../../../primitives/button'
import { errorAt } from './field-errors'
import type { NodeProblem } from './problems'
import { TargetField } from './target-field'
import { ValueField } from './value-field'
import { text } from './messages'

type ChoiceFieldsProps = { state: ChoiceState; names: readonly string[]; problems: readonly NodeProblem[]; disabled?: boolean; onChange: (state: ChoiceState) => void }

/** A Choice's rules, each a condition and the state it leads to when true, and the state it leads to otherwise. */
export const ChoiceFields = ({ state, names, problems, disabled, onChange }: ChoiceFieldsProps) => {
  const rules = state.Choices ?? []
  const setRule = (index: number, rule: ChoiceRule) => onChange({ ...state, Choices: rules.map((held, at) => (at === index ? rule : held)) })
  return (
    <>
      {rules.map((rule, index) => (
        <fieldset key={index} className="flex flex-col gap-3 rounded-md border p-3 sm:col-span-2">
          <legend className="px-1 text-xs font-medium text-muted-foreground">{text('ruleNumber', { number: index + 1 })}</legend>
          <ValueField
            label={text('condition')}
            kind="text"
            help={text('conditionHelp')}
            value={rule.Condition}
            error={errorAt(problems, `Choices[${index}].Condition`)}
            disabled={disabled}
            onChange={(value) => setRule(index, { ...rule, Condition: typeof value === 'string' ? value : '' })}
          />
          <TargetField label={text('thenGoesTo')} value={rule.Next || undefined} names={names} none={text('chooseStep')} error={errorAt(problems, `Choices[${index}].Next`)} disabled={disabled} onChange={(name) => setRule(index, { ...rule, Next: name ?? '' })} />
          {!disabled && (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange({ ...state, Choices: rules.filter((_, at) => at !== index) })}>
              <Trash2 className="size-3.5" />
              {text('removeRule')}
            </Button>
          )}
        </fieldset>
      ))}
      {!disabled && (
        <div className="sm:col-span-2">
          <Button size="sm" onClick={() => onChange({ ...state, Choices: [...rules, { Condition: '', Next: '' }] })}>
            <Plus className="size-3.5" />
            {text('addRule')}
          </Button>
        </div>
      )}
      <TargetField
        label={text('otherwiseGoesTo')}
        value={state.Default}
        names={names}
        none={text('noDefault')}
        error={errorAt(problems, 'Default')}
        disabled={disabled}
        onChange={(name) => {
          const { Default: _, ...rest } = state
          onChange(name === undefined ? rest : { ...rest, Default: name })
        }}
      />
    </>
  )
}
