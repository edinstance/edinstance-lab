export function ServiceStat({
  label,
  value,
  good = false,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#342e40] bg-[#1a1722] p-4">
      <p className="m-0 text-xs tracking-[.12em] text-[#777080] uppercase">
        {label}
      </p>
      <p
        className={`mt-2 mb-0 text-xl font-semibold ${
          good ? "text-[#63d99d]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
