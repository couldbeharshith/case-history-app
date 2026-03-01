import fs from "fs";
import path from "path";
import type { Chat, ChatListItem } from "./types";

const DATA_DIR = path.join(process.cwd(), "chat-data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function chatFilePath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export function getAllChats(): ChatListItem[] {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const chats: ChatListItem[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      const chat: Chat = JSON.parse(raw);
      chats.push({
        id: chat.id,
        cnr_num: chat.cnr_num,
        title: chat.title,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
      });
    } catch {
      // skip corrupt files
    }
  }

  return chats.sort((a, b) => b.updated_at - a.updated_at);
}

export function getChat(id: string): Chat | null {
  ensureDataDir();
  const fp = chatFilePath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

export function saveChat(chat: Chat): void {
  ensureDataDir();
  fs.writeFileSync(chatFilePath(chat.id), JSON.stringify(chat, null, 2));
}

export function deleteChat(id: string): boolean {
  ensureDataDir();
  const fp = chatFilePath(id);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}
