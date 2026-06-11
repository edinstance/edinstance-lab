import { Handle } from '@xyflow/react'

import type { TopologyNodeData } from '../topology/types'

type TopologyNodeProps = {
  data: TopologyNodeData
  selected?: boolean
}

export function TopologyNode({ data, selected = false }: TopologyNodeProps) {
  return (
    <article className={`topology-node topology-node--${data.category}${selected ? ' is-selected' : ''}`}>
      {data.targetPosition ? (
        <Handle className="topology-handle" position={data.targetPosition} type="target" />
      ) : null}
      <div className="node-accent" aria-hidden="true" />
      <div className="node-content">
        <div className="node-title-row">
          <h3>{data.title}</h3>
          {data.status ? <span>{data.status}</span> : null}
        </div>
        <p>{data.subtitle}</p>
      </div>
      {data.sourcePosition ? (
        <Handle className="topology-handle" position={data.sourcePosition} type="source" />
      ) : null}
    </article>
  )
}
