import { Handle } from "@xyflow/react";
import type { TopologyNodeData } from "../topology/types";

export function TopologyNode({
  data,
  selected = false,
}: {
  data: TopologyNodeData;
  selected?: boolean;
}) {
  const online = data.status === "ready" || data.status === "active";
  return (
    <article
      className={`relative flex h-[190px] w-[360px] cursor-pointer flex-col overflow-hidden rounded-2xl border bg-[#17141f] shadow-[0_18px_45px_rgba(0,0,0,.28)] transition duration-200 ${selected ? "border-[#a855f7] shadow-[0_0_0_1px_#a855f7,0_20px_55px_rgba(88,28,135,.28)]" : "border-[#3a3445] hover:-translate-y-0.5 hover:border-[#5d526c]"}`}
    >
      {data.targetPosition ? (
        <Handle
          className="!h-2.5 !w-2.5 !border-2 !border-[#17141f] !bg-[#6e657b]"
          position={data.targetPosition}
          type="target"
        />
      ) : null}
      <div className="flex-1 p-6">
        <div className="flex items-start gap-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
              data.category === "service"
                ? "border-[#5b4270] bg-[#281d35] text-[#c084fc]"
                : data.category === "database"
                  ? "border-[#34534a] bg-[#172820] text-[#67dba2]"
                  : "border-[#45404d] bg-[#211e27] text-[#aaa3b4]"
            }`}
          >
            {data.category === "service"
              ? "</>"
              : data.category === "database"
                ? "DB"
                : "◆"}
          </div>
          <div className="min-w-0">
            <h3 className="m-0 truncate text-lg font-semibold tracking-[-.015em] text-[#f6f2fa]">
              {data.title}
            </h3>
            <p className="mt-1 mb-0 truncate text-sm text-[#8e8799]">
              {data.facts.public ?? data.facts.image ?? data.subtitle}
            </p>
          </div>
        </div>
        <div className="mt-7 flex items-center gap-3 text-sm">
          <span
            className={`h-2.5 w-2.5 rounded-full ${online ? "bg-[#4ed08f] shadow-[0_0_0_5px_rgba(78,208,143,.08)]" : "bg-[#e5aa55] shadow-[0_0_0_5px_rgba(229,170,85,.08)]"}`}
          />
          <span className={online ? "text-[#67dba2]" : "text-[#e7b66e]"}>
            {online ? "Online" : (data.status ?? "Pending")}
          </span>
        </div>
      </div>
      <div className="border-t border-[#332e3d] bg-[#1a1722] px-6 py-4 text-sm text-[#8e8799]">
        <span className="mr-2 text-[#aaa3b4]">◇</span>
        {data.subtitle}
      </div>
      {data.sourcePosition ? (
        <Handle
          className="!h-2.5 !w-2.5 !border-2 !border-[#17141f] !bg-[#6e657b]"
          position={data.sourcePosition}
          type="source"
        />
      ) : null}
    </article>
  );
}
