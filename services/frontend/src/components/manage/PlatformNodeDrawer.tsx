import type { TopologyNodeData } from "../../topology/types";

interface PlatformNodeDrawerProps {
  node: TopologyNodeData;
  onClose: () => void;
}

export function PlatformNodeDrawer({ node, onClose }: PlatformNodeDrawerProps) {
  return (
    <aside className="absolute top-4 right-4 bottom-4 z-40 flex w-[min(620px,calc(100vw-120px))] flex-col overflow-hidden rounded-2xl border border-[#3a3445] bg-[#15121d]/[.985] shadow-[-24px_0_80px_rgba(0,0,0,.45)] backdrop-blur-xl max-[800px]:inset-2 max-[800px]:w-auto">
      <header className="flex items-start justify-between gap-4 border-b border-[#312c3a] px-8 py-7 max-[640px]:px-5">
        <div className="min-w-0">
          <p className="m-0 text-xs font-semibold tracking-[.16em] text-[#8f879e] uppercase">
            Platform infrastructure
          </p>
          <h2 className="mt-2 mb-0 text-3xl font-semibold tracking-[-.025em]">
            {node.title}
          </h2>
          <p className="mt-2 mb-0 text-sm text-[#8f879e]">{node.subtitle}</p>
        </div>
        <button
          aria-label="Close platform details"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-3xl text-[#91899f] hover:bg-white/5 hover:text-white"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-8 max-[640px]:p-5">
        <p className="mt-0 text-base leading-7 text-[#c8c1d0]">
          {node.details}
        </p>
        <dl className="mt-8 grid gap-3">
          {Object.entries(node.facts).map(([label, value]) =>
            value ? (
              <div
                className="grid grid-cols-[140px_1fr] gap-4 rounded-xl border border-[#332e3d] bg-[#1a1722] px-5 py-4 max-[520px]:grid-cols-1 max-[520px]:gap-1"
                key={label}
              >
                <dt className="text-xs font-semibold tracking-[.12em] text-[#81798c] uppercase">
                  {label}
                </dt>
                <dd className="m-0 text-sm break-all text-[#eee9f3]">
                  {value}
                </dd>
              </div>
            ) : null,
          )}
        </dl>
        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold tracking-[.12em] text-[#81798c] uppercase">
            Source
          </p>
          {node.sources.map((source) => (
            <code
              className="block rounded-lg border border-[#332e3d] bg-[#100e17] px-4 py-3 text-sm text-[#c9a7f5]"
              key={source}
            >
              {source}
            </code>
          ))}
        </div>
      </div>
    </aside>
  );
}
