import type { ChatListItem } from "./types";

const CHAT_UPDATED = "caseflow:chat-updated";

export function announceChatUpdate(chat: ChatListItem) {
  window.dispatchEvent(new CustomEvent<ChatListItem>(CHAT_UPDATED, { detail: chat }));
}

export function subscribeToChatUpdates(listener: (chat: ChatListItem) => void) {
  const handleUpdate = (event: Event) => listener((event as CustomEvent<ChatListItem>).detail);
  window.addEventListener(CHAT_UPDATED, handleUpdate);
  return () => window.removeEventListener(CHAT_UPDATED, handleUpdate);
}
