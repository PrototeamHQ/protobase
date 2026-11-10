import { innerMachine, type Definition, type Machine, type State, type Trigger } from '@protobase/workflows'
import { pathOf, triggerId, type StatePath } from './definition'

/**
 * Where an edge leaves its node, and so what it sets when drawn: `next` a state's Next, `rule` a Choice rule's Next,
 * `default` a Choice's Default, `catch` a catcher's Next, `start` the StartAt of the machine the trigger starts.
 */
export type EdgeKind = 'next' | 'rule' | 'default' | 'catch' | 'start'

export type GraphNode =
  | { kind: 'trigger'; id: typeof triggerId; trigger: Trigger }
  /** `parent` is the path of the Map or Block whose steps it is one of, `first` whether its machine starts at it. */
  | { kind: 'state'; id: StatePath; name: string; state: State; scope: string[]; parent?: StatePath; first: boolean }

/** An edge, by the field of its source state that names its target (`Next`, `Choices[0].Next`, `Catch[1].Next`). */
export type GraphEdge = { id: string; kind: EdgeKind; source: string; target: StatePath; field: string; label?: string }

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] }

const rulesOf = (state: State) => (state.Type === 'Choice' && Array.isArray(state.Choices) ? state.Choices : [])
const catchersOf = (state: State) => ('Catch' in state && Array.isArray(state.Catch) ? state.Catch : [])

// The edges a state names, each to a state of its own machine; one naming no state there is left out, and the
// definition check names it on the state.
const stateEdges = (machine: Machine, scope: string[], name: string, state: State): GraphEdge[] => {
  const source = pathOf(scope, name)
  const edge = (kind: EdgeKind, field: string, target: string, label?: string): GraphEdge[] =>
    Object.hasOwn(machine.States, target) ? [{ id: `${source}\n${field}`, kind, source, target: pathOf(scope, target), field, ...(label !== undefined && { label }) }] : []
  return [
    ...('Next' in state && typeof state.Next === 'string' ? edge('next', 'Next', state.Next) : []),
    ...rulesOf(state).flatMap((rule, index) => edge('rule', `Choices[${index}].Next`, rule.Next, rule.Condition)),
    ...(state.Type === 'Choice' && typeof state.Default === 'string' ? edge('default', 'Default', state.Default) : []),
    ...catchersOf(state).flatMap((catcher, index) => edge('catch', `Catch[${index}].Next`, catcher.Next, Array.isArray(catcher.ErrorEquals) ? catcher.ErrorEquals.join(', ') : undefined)),
  ]
}

const machineGraph = (machine: Machine, scope: string[]): Graph => {
  const parent = scope.length > 0 ? scope.join('/') : undefined
  const parts = Object.entries(machine.States).map(([name, state]): Graph => {
    const node: GraphNode = { kind: 'state', id: pathOf(scope, name), name, state, scope, ...(parent !== undefined && { parent }), first: machine.StartAt === name }
    const steps = innerMachine(state)
    const inner = steps?.States ? machineGraph(steps, [...scope, name]) : { nodes: [], edges: [] }
    return { nodes: [node, ...inner.nodes], edges: [...stateEdges(machine, scope, name, state), ...inner.edges] }
  })
  return { nodes: parts.flatMap((part) => part.nodes), edges: parts.flatMap((part) => part.edges) }
}

/**
 * The definition as a graph: the trigger, each state a node in the order the definition lists them, a Map's or a
 * Block's states inside it, and an edge for each state a state names. A Map or Block comes before the states inside it. The definition holds
 * no positions; the layout places the nodes.
 */
export const definitionGraph = (definition: Definition): Graph => {
  const machine = definition.stateMachine
  const states = machineGraph(machine, [])
  const start: GraphEdge[] = Object.hasOwn(machine.States, machine.StartAt) ? [{ id: '\nStartAt', kind: 'start', source: triggerId, target: machine.StartAt, field: 'StartAt' }] : []
  return { nodes: [{ kind: 'trigger', id: triggerId, trigger: definition.trigger }, ...states.nodes], edges: [...start, ...states.edges] }
}
