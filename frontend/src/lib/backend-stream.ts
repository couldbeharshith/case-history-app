import { readEvents, streamError } from "./case-stream";

export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function relayCaseStream(
  url: string,
  init: RequestInit,
  onComplete: (text: string, metadata: Record<string, string> | null) => void,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch {
    return Response.json({ error: "CaseFlow’s backend is unavailable. Try again." }, { status: 502 });
  }

  if (!upstream.ok) {
    const data = await upstream.json().catch(() => null);
    const error = typeof data?.detail === "string" ? data.detail : "Couldn’t start this request. Try again.";
    return Response.json({ error }, { status: upstream.status });
  }
  if (!upstream.body) {
    return Response.json({ error: "CaseFlow received no response. Try again." }, { status: 502 });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const requiresCompletion = upstream.headers.get("x-caseflow-stream") === "2";
  const pieces: string[] = [];
  let buffer = "";
  let completed = false;
  let metadata: Record<string, string> | null = null;
  let failed = false;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (cancelled) return;
        buffer += decoder.decode(value, { stream: !done });
        buffer = readEvents(buffer, (event) => {
          if (event.type === "text_chunk" && event.content) pieces.push(event.content);
          if (event.type === "complete") {
            completed = true;
            metadata = event.metadata;
          }
          if (streamError(event)) failed = true;
        });

        if (!done) {
          controller.enqueue(value);
          return;
        }

        if (!failed) {
          const text = pieces.join("");
          if (!text.trim() || (requiresCompletion && !completed)) {
            throw new Error("Incomplete case stream");
          }
          onComplete(text, metadata);
        }
        controller.close();
      } catch {
        if (cancelled) return;
        const error = {
          type: "summary_log",
          content: "Error: The request was interrupted. Try again.",
          metadata: null,
        };
        controller.enqueue(encoder.encode(`\n\ndata: ${JSON.stringify(error)}\n\n`));
        controller.close();
        await reader.cancel().catch(() => {});
      }
    },
    async cancel(reason) {
      cancelled = true;
      await reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
