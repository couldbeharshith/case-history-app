import { getChat, saveChat } from "../../../../../lib/storage";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chat = getChat(id);
  if (!chat) {
    return new Response(JSON.stringify({ error: "Chat not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cnr = chat.cnr_num;

  // Add user message
  chat.messages.push({
    role: "user",
    content: `Generate case summary for CNR: ${cnr}`,
    timestamp: Date.now(),
  });
  saveChat(chat);

  // Stream from backend
  const backendUrl = `${BACKEND_URL}/case-summary?cnr_num=${encodeURIComponent(cnr)}&chat_id=${encodeURIComponent(id)}`;

  try {
    const backendRes = await fetch(backendUrl);

    if (!backendRes.ok) {
      const errText = await backendRes.text();
      // Don't save error as assistant message — roll back the user message
      chat.messages.pop();
      chat.updated_at = Date.now();
      saveChat(chat);
      return new Response(JSON.stringify({ error: errText }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const reader = backendRes.body?.getReader();
    if (!reader) {
      return new Response(JSON.stringify({ error: "No response body" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const decoder = new TextDecoder();
    let fullText = "";

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          // Save complete assistant message
          chat.messages.push({
            role: "assistant",
            content: fullText,
            timestamp: Date.now(),
          });
          chat.updated_at = Date.now();
          saveChat(chat);
          controller.close();
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        controller.enqueue(new TextEncoder().encode(chunk));
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    // Roll back the user message on failure
    chat.messages.pop();
    chat.updated_at = Date.now();
    saveChat(chat);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
