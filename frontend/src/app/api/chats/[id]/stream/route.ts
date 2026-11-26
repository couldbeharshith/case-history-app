import { BACKEND_URL, relayCaseStream } from "../../../../../lib/backend-stream";
import { getChat, saveChat } from "../../../../../lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chat = getChat(id);
  if (!chat) return Response.json({ error: "Chat not found." }, { status: 404 });

  const query = new URLSearchParams({
    cnr_num: chat.cnr_num,
    chat_id: id,
    extract_fir: String(chat.extract_fir ?? true),
  });

  return relayCaseStream(`${BACKEND_URL}/case-summary?${query}`, { signal: request.signal }, (summary) => {
    const latest = getChat(id);
    if (!latest) return;
    const timestamp = Date.now();
    latest.messages = [
      { role: "user", content: `Generate case summary for CNR: ${chat.cnr_num}`, timestamp },
      { role: "assistant", content: summary, timestamp },
    ];
    latest.updated_at = timestamp;
    saveChat(latest);
  });
}
