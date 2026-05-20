export type ChosenOption = {
  speaker: "user" | "counterpart";
  optionText: string;
  optionIndex: number;
  chosenAt: string;
  translation?: string;
};

export type SessionForTranscript = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  taskContext: string | null;
  createdAt: string;
  chosenOptions: ChosenOption[];
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function generateTranscriptText(session: SessionForTranscript): string {
  const lines: string[] = [
    "СУФЛЕР — ТРАНСКРИПТ ЗВОНКА",
    "",
    `Дата: ${formatDate(session.startedAt)}`,
  ];

  if (session.taskContext) {
    lines.push(`Контекст: ${session.taskContext}`);
  }

  if (session.endedAt) {
    lines.push(`Завершён: ${formatDate(session.endedAt)}`);
  }

  lines.push("", "-------------------------", "");

  if (session.chosenOptions.length === 0) {
    lines.push("(Реплики не выбраны)");
  } else {
    for (const opt of session.chosenOptions) {
      const label = opt.speaker === "counterpart" ? "Собеседник" : "Вы";
      lines.push(`${label}:\n${opt.optionText}`, "");
    }
  }

  return lines.join("\n").trimEnd();
}

export function transcriptFilename(startedAt: string): string {
  const d = new Date(startedAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `call_${y}-${m}-${day}_${h}-${min}.txt`;
}

export function downloadTranscript(session: SessionForTranscript): void {
  const content = generateTranscriptText(session);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = transcriptFilename(session.startedAt);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
