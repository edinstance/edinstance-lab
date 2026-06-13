interface ManageNotificationProps {
  kind: "error" | "notice";
  message: string;
}

export function ManageNotification({ kind, message }: ManageNotificationProps) {
  const isError = kind === "error";

  return (
    <div
      className={`absolute bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-2xl ${
        isError
          ? "border-[#ef6b73]/40 bg-[#2a1118]/95 text-[#ffabb0]"
          : "border-[#58c991]/30 bg-[#10251d]/95 text-[#8de2b4]"
      }`}
      role={isError ? "alert" : "status"}
    >
      {message}
    </div>
  );
}
