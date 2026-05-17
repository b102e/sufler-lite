export type CallProfile = {
  caller_name: string | null;
  organization: string | null;
  call_goal: string | null;
  required_identity: string | null;
  important_numbers: string | null;
  language: "ru";
  notes: string | null;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatApiRequest = {
  messages: ChatTurn[];
  initial_description: string;
  current_profile: CallProfile | null;
};

export type BudgetState = {
  user_message_count: number;
  is_near_limit: boolean;
  is_hard_limit: boolean;
};

export type ChatApiResponse = {
  assistant_message: string;
  profile: CallProfile;
  missing_fields: string[];
  is_ready_for_call: boolean;
  confidence: number;
  budget: BudgetState;
};

export const emptyProfile: CallProfile = {
  caller_name: null,
  organization: null,
  call_goal: null,
  required_identity: null,
  important_numbers: null,
  language: "ru",
  notes: null,
};

export function isValidChatResponse(data: unknown): data is ChatApiResponse {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.assistant_message === "string" &&
    d.assistant_message.length > 0 &&
    typeof d.profile === "object" &&
    d.profile !== null &&
    Array.isArray(d.missing_fields) &&
    typeof d.is_ready_for_call === "boolean" &&
    typeof d.confidence === "number"
  );
}
