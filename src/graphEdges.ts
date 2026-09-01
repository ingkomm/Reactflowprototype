import type { Edge } from '@xyflow/react'
import type { PassiveFlowNode } from './components/PassiveNode'
import { classifyPassiveConnection, isValidRootConnectHandles } from './power'
import type { PassiveNodeData } from './types'

function classifyLink(
  source: PassiveFlowNode,
  target: PassiveFlowNode,
  nodes: PassiveFlowNode[],
) {
  return classifyPassiveConnection(source, target, nodes)
}

/** Remove structurally invalid edges; does not delete unreachable links. */
export function pruneInvalidEdges(nodes: PassiveFlowNode[], edges: Edge[]): Edge[] {
  return edges.filter((e) => {
    const source = nodes.find((n) => n.id === e.source)
    const target = nodes.find((n) => n.id === e.target)
    if (!source || !target) return false
    const linkKind = classifyLink(source, target, nodes)
    if (e.type === 'orbit') return linkKind === 'orbit'
    if (e.type === 'notable') return linkKind === 'notable'
    if (linkKind !== 'center') return false
    const sd = source.data as PassiveNodeData
    const td = target.data as PassiveNodeData
    if (sd.kind === 'initial' || td.kind === 'initial') {
      return isValidRootConnectHandles(source, target, e.sourceHandle, e.targetHandle)
    }
    return true
  })
}
