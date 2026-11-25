import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "path";
import type { Chat, ChatListItem } from "./types";

const DATA_DIR = path.join(process.cwd(), "chat-data");
const CHAT_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
  if (!CHAT_ID.test(id)) return null;
  const fp = chatFilePath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

export function saveChat(chat: Chat): void {
  if (!CHAT_ID.test(chat.id)) throw new Error("Invalid chat ID");
  ensureDataDir();
  const temporary = path.join(DATA_DIR, `.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(chat, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, chatFilePath(chat.id));
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function deleteChat(id: string): boolean {
  if (!CHAT_ID.test(id)) return false;
  const fp = chatFilePath(id);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}
