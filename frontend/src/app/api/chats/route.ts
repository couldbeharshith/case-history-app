import { NextResponse } from "next/server";
import { getAllChats, saveChat } from "../../../lib/storage";
import type { Chat } from "../../../lib/types";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const chats = getAllChats();
  return NextResponse.json(chats);
}

export async function POST(request: Request) {
  const body = await request.json();
  const cnr_num: string = body.cnr_num;

  if (!cnr_num || typeof cnr_num !== "string") {
    return NextResponse.json({ error: "cnr_num is required" }, { status: 400 });
  }

  const chat: Chat = {
    id: uuidv4(),
    cnr_num: cnr_num.trim().toUpperCase(),
    title: `Case ${cnr_num.trim().toUpperCase()}`,
    messages: [],
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  saveChat(chat);
  return NextResponse.json(chat, { status: 201 });
}
