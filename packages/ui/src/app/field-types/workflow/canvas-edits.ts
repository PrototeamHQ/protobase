import { connect, disconnect, removeState } from './definition-edits'
import { setArgument } from './pins/argument-edits'
import { addCondition, conditionChoices, setConditionSide } from './pins/condition-edits'
import { connectData, disconnectData, removePure, wireRefusal } from './pins/data-edits'
import { addSelect } from './pins/select-edits'

/**
 * What an editable canvas changes a definition with: connecting and removing states, wiring pins, and the Break, Make
 * condition and Select nodes. The editors hand it to the canvas with their `onChange`, so the run's canvas, which only shows a
 * workflow, loads none of it.
 */
export const canvasEdits = { connect, disconnect, removeState, setArgument, connectData, disconnectData, removePure, wireRefusal, addCondition, conditionChoices, setConditionSide, addSelect }

export type CanvasEdits = typeof canvasEdits
