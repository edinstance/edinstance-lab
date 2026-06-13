import { Handle } from '@xyflow/react'

import type { TopologyNodeData } from '../topology/types'

type TopologyNodeProps = {
  data: TopologyNodeData
  selected?: boolean
}

export function TopologyNode({ data, selected = false }: TopologyNodeProps) {
  const accent = {
    build: 'bg-[#b0822e]',
    dns: 'bg-[#d65236]',
    gateway: 'bg-[#315c52]',
    registry: 'bg-[#2d6f8f]',
    service: 'bg-[#517a38]',
    system: 'bg-[#17211b]',
  }[data.category]

  return (
    <article className={`relative grid min-h-[86px] w-[270px] grid-cols-[8px_1fr] items-stretch border-[1.6px] bg-[#fffdf7] ${selected ? 'border-[#d65236] shadow-[0_0_0_3px_rgba(214,82,54,.14)]' : 'border-[#26342c]'}`}>
      {data.targetPosition ? (
        <Handle className="!h-[9px] !w-[9px] !border-2 !border-[#fffdf7] !bg-[#17211b]" position={data.targetPosition} type="target" />
      ) : null}
      <div className={accent} aria-hidden="true" />
      <div className="px-[18px] py-4">
        <div className="flex items-start justify-between gap-2.5">
          <h3 className="m-0 font-mono text-base font-black leading-[1.15]">{data.title}</h3>
          {data.status ? <span className="shrink-0 border border-[#517a3859] px-1.5 py-[5px] font-mono text-[.58rem] font-black uppercase leading-none text-[#517a38]">{data.status}</span> : null}
        </div>
        <p className="mb-0 mt-2.5 font-mono text-[.78rem] font-extrabold leading-[1.45] text-[#66736b]">{data.subtitle}</p>
      </div>
      {data.sourcePosition ? (
        <Handle className="!h-[9px] !w-[9px] !border-2 !border-[#fffdf7] !bg-[#17211b]" position={data.sourcePosition} type="source" />
      ) : null}
    </article>
  )
}
