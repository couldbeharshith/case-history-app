import { NextResponse } from "next/server";
import { getChat, saveChat, deleteChat } from "../../../../lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chat = getChat(id);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  return NextResponse.json(chat);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteChat(id);
  if (!deleted) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }
  const chat = getChat(id);
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }
  if (body.messages) {
    chat.messages = body.messages;
  }
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Enter a case title." }, { status: 400 });
    }
    chat.title = title;
    chat.title_source = "manual";
  }
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== "boolean") {
      return NextResponse.json({ error: "Invalid pin state." }, { status: 400 });
    }
    chat.pinned = body.pinned;
  }
  if (body.messages || body.title !== undefined) chat.updated_at = Date.now();
  saveChat(chat);

  return NextResponse.json(chat);
}
