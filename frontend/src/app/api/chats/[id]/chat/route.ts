import { BACKEND_URL, relayCaseStream } from "../../../../../lib/backend-stream";
import { getChat, saveChat } from "../../../../../lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getChat(id)) return Response.json({ error: "Chat not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "Enter a question." }, { status: 400 });

  return relayCaseStream(
    `${BACKEND_URL}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: id, question }),
      signal: request.signal,
    },
    (answer) => {
      const chat = getChat(id);
      if (!chat) return;
      const timestamp = Date.now();
      chat.messages.push(
        { role: "user", content: question, timestamp },
        { role: "assistant", content: answer, timestamp },
      );
      chat.updated_at = timestamp;
      saveChat(chat);
    },
  );
}
