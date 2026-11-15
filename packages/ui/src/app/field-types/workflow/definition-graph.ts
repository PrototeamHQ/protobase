import { dependsOn, innerMachine, machineDependencies, orderOf, type Definition, type Machine, type State, type Trigger } from '@protobase/workflows'
import { pathOf, triggerId, type StatePath } from './definition'

/**
 * Where an edge leaves its node, and so what it sets when drawn: `next` a state's Next, `rule` a Choice rule's Next,
 * `default` a Choice's Default, `catch` a catcher's Next, `start` the StartAt of the machine the trigger starts. In data
 * order an edge is drawn from what a state reads instead: `reads`, some of its variables, or `status`, its status
 * alone; and `start` from the trigger to each state that reads from no other.
 */
export type EdgeKind = 'next' | 'rule' | 'default' | 'catch' | 'start' | 'reads' | 'status'

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
    ...catchersOf(state).flatMap((catcher, index) => (catcher.Next === undefined ? [] : edge('catch', `Catch[${index}].Next`, catcher.Next, Array.isArray(catcher.ErrorEquals) ? catcher.ErrorEquals.join(', ') : undefined))),
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

// In data order, an edge from each state to each one that reads from it: its variables, or only its status, which runs
// after it all the same; and from the trigger to each state that reads from none.
const dataEdges = (machine: Machine, scope: string[], fromTrigger: boolean): GraphEdge[] => {
  const dependencies = machineDependencies(machine)
  return [...dependencies].flatMap(([name, own]): GraphEdge[] => {
    const target = pathOf(scope, name)
    const edges = [...dependsOn(own)].map((from): GraphEdge => {
      const kind = own.data.has(from) ? 'reads' : 'status'
      return { id: `${pathOf(scope, from)}\n${kind}\n${target}`, kind, source: pathOf(scope, from), target, field: kind }
    })
    const inner = innerMachine(machine.States[name])
    const nested = inner?.States ? dataEdges(inner, [...scope, name], false) : []
    const root: GraphEdge[] = fromTrigger && edges.length === 0 ? [{ id: `\nStart\n${target}`, kind: 'start', source: triggerId, target, field: 'StartAt' }] : []
    return [...root, ...edges, ...nested]
  })
}

/**
 * The definition as a graph: the trigger, each state a node in the order the definition lists them, a Map's or a
 * Block's states inside it, and an edge for each state a state names. A Map or Block comes before the states inside it. The definition holds
 * no positions; the layout places the nodes.
 */
export const definitionGraph = (definition: Definition): Graph => {
  const machine = definition.stateMachine
  const states = machineGraph(machine, [])
  if (orderOf(definition) === 'data') return { nodes: [{ kind: 'trigger', id: triggerId, trigger: definition.trigger }, ...states.nodes.map((node) => (node.kind === 'state' ? { ...node, first: false } : node))], edges: dataEdges(machine, [], true) }
  const start: GraphEdge[] = machine.StartAt !== undefined && Object.hasOwn(machine.States, machine.StartAt) ? [{ id: '\nStartAt', kind: 'start', source: triggerId, target: machine.StartAt, field: 'StartAt' }] : []
  return { nodes: [{ kind: 'trigger', id: triggerId, trigger: definition.trigger }, ...states.nodes], edges: [...start, ...states.edges] }
}
