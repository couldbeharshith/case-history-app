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

  // Stream SSE from backend
  const backendUrl = `${BACKEND_URL}/case-summary?cnr_num=${encodeURIComponent(cnr)}&chat_id=${encodeURIComponent(id)}`;

  try {
    const backendRes = await fetch(backendUrl);

    if (!backendRes.ok) {
      const errText = await backendRes.text();
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
      chat.messages.pop();
      chat.updated_at = Date.now();
      saveChat(chat);
      return new Response(JSON.stringify({ error: "No response body" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const decoder = new TextDecoder();
    let fullText = "";
    let sseBuffer = "";

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          // Save assistant message with accumulated summary
          if (fullText) {
            chat.messages.push({
              role: "assistant",
              content: fullText,
              timestamp: Date.now(),
            });
          }
          chat.updated_at = Date.now();
          saveChat(chat);
          controller.close();
          return;
        }

        const raw = decoder.decode(value, { stream: true });
        sseBuffer += raw;

        // Parse complete SSE events to accumulate text_chunk content
        let idx: number;
        while ((idx = sseBuffer.indexOf("\n\n")) !== -1) {
          const eventStr = sseBuffer.slice(0, idx);
          sseBuffer = sseBuffer.slice(idx + 2);
          if (eventStr.startsWith("data: ")) {
            try {
              const evt = JSON.parse(eventStr.slice(6));
              if (evt.type === "text_chunk" && evt.content) {
                fullText += evt.content;
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        // Forward raw SSE bytes to browser
        controller.enqueue(value);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    chat.messages.pop();
    chat.updated_at = Date.now();
    saveChat(chat);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
