export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  cnr_num: string;
  extract_fir?: boolean;
  title: string;
  title_source?: "generated" | "manual";
  messages: ChatMessage[];
  created_at: number;
  updated_at: number;
}

export interface ChatListItem {
  id: string;
  cnr_num: string;
  title: string;
  created_at: number;
  updated_at: number;
}
