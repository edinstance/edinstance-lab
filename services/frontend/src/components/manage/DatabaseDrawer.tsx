import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getDatabaseCredentials } from "../../platform/api";
import { Button } from "../ui/Button";
import type { PostgresDatabase } from "../../platform/api";

type DatabaseTab = "overview" | "connect";

export function DatabaseDrawer({
  database,
  onClose,
}: {
  database: PostgresDatabase;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DatabaseTab>("overview");
  return (
    <aside className="absolute top-4 right-4 bottom-4 z-40 flex w-[min(900px,calc(100vw-120px))] flex-col overflow-hidden rounded-2xl border border-[#3a3445] bg-[#15121d]/[.985] shadow-[-24px_0_80px_rgba(0,0,0,.45)] backdrop-blur-xl max-[800px]:inset-2 max-[800px]:w-auto">
      <header className="border-b border-[#312c3a] px-8 pt-7 max-[640px]:px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[.16em] text-[#8f879e] uppercase">PostgreSQL</p>
            <h2 className="mt-2 mb-0 text-3xl font-semibold">{database.name}</h2>
            <p className="mt-2 mb-0 text-sm text-[#8f879e]">{database.host}</p>
          </div>
          <button aria-label="Close database details" className="text-3xl text-[#91899f] hover:text-white" onClick={onClose}>×</button>
        </div>
        <nav className="mt-7 flex gap-8">
          {(["overview", "connect"] as const).map((item) => (
            <button className={`border-b-2 pb-4 text-sm font-medium capitalize ${tab === item ? "border-[#a855f7] text-white" : "border-transparent text-[#8f879e]"}`} key={item} onClick={() => setTab(item)}>{item}</button>
          ))}
        </nav>
      </header>
      <div className="flex-1 overflow-y-auto p-8 max-[640px]:p-5">
        {tab === "overview" ? <DatabaseOverview database={database} /> : <ConnectTab database={database} />}
      </div>
    </aside>
  );
}

function DatabaseOverview({ database }: { database: PostgresDatabase }) {
  const facts = {
    Status: database.status,
    Version: database.version,
    Database: database.database,
    Owner: database.owner,
    Instances: String(database.instances),
    Storage: database.storageSize,
    Pooler: database.poolerEnabled ? `${database.poolerInstances} (${database.poolMode})` : "disabled",
  };
  return <dl className="grid grid-cols-[140px_1fr] gap-4 rounded-xl border border-[#342e40] p-5 text-sm">{Object.entries(facts).map(([label, value]) => <div className="contents" key={label}><dt className="text-[#91899f]">{label}</dt><dd className="m-0 font-mono">{value}</dd></div>)}</dl>;
}

function ConnectTab({ database }: { database: PostgresDatabase }) {
  const [visible, setVisible] = useState(false);
  const { data, error, isLoading } = useQuery({
    queryKey: ["database-credentials", database.name],
    queryFn: () => getDatabaseCredentials(database.name),
    staleTime: 60_000,
  });
  if (isLoading) return <p className="text-[#91899f]">Loading credentials…</p>;
  if (error || !data) return <p className="text-[#ff8d96]">{error instanceof Error ? error.message : "Credentials unavailable"}</p>;
  const rows = [
    ["Host", data.host], ["Port", String(data.port)], ["Database", data.database],
    ["Username", data.username], ["Password", visible ? data.password : "••••••••••••"],
    ["Connection URL", visible ? data.url : "••••••••••••"],
  ];
  return <div className="grid gap-4">
    <div className="flex justify-end"><Button variant="outline" onClick={() => setVisible((value) => !value)}>{visible ? "Hide credentials" : "Reveal credentials"}</Button></div>
    {rows.map(([label, value]) => <div className="rounded-xl border border-[#342e40] p-4" key={label}><div className="mb-2 text-xs font-semibold tracking-[.12em] text-[#91899f] uppercase">{label}</div><div className="flex items-center gap-3"><code className="min-w-0 flex-1 break-all text-sm">{value}</code><Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(value)}>Copy</Button></div></div>)}
  </div>;
}
