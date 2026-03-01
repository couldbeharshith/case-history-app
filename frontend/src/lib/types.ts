export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  cnr_num: string;
  title: string;
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
