export type SuggestSingle = {
  italian: string;
  russian: string;
  translit: string;
  is_farewell?: boolean;
};

export type HistoryEntry = {
  role: "user" | "counterpart";
  text: string;
};

export type SuggestRequest = {
  heard_text: string | null;
  call_context: string;
  history: HistoryEntry[];
  regenerate?: boolean;
};


export const SUGGEST_FALLBACK: SuggestSingle = {
  italian: "Potrebbe ripetere, per favore?",
  russian: "Повторите, пожалуйста.",
  translit: "Потрэббе рипетере, пер фаворе?",
};
