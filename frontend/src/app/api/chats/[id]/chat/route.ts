import { getChat, saveChat } from "../../../../../lib/storage";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(
  request: Request,
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

  const body = await request.json();
  const question: string = body.question?.trim();
  if (!question) {
    return new Response(JSON.stringify({ error: "question is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Persist the user follow-up message
  chat.messages.push({ role: "user", content: question, timestamp: Date.now() });
  chat.updated_at = Date.now();
  saveChat(chat);

  try {
    const backendRes = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: id,
        question,
      }),
    });

    if (!backendRes.ok) {
      const errText = await backendRes.text();
      // Roll back the user message — don't pollute history with failed turns
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
      // Roll back the user message
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

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          // Save completed assistant message
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
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    // Roll back the user message — don't leave an orphaned user turn with no reply
    chat.messages.pop();
    chat.updated_at = Date.now();
    saveChat(chat);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
