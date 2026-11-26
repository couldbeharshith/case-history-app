export interface CaseStreamEvent {
  type: "text_chunk" | "summary_log" | "manual_input_request" | "complete";
  content: string | null;
  metadata: Record<string, string> | null;
}

export function readEvents(buffer: string, onEvent: (event: CaseStreamEvent) => void): string {
  let boundary = buffer.indexOf("\n\n");
  while (boundary !== -1) {
    const frame = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    boundary = buffer.indexOf("\n\n");
    if (!frame.startsWith("data: ")) continue;

    let event: CaseStreamEvent;
    try {
      event = JSON.parse(frame.slice(6));
    } catch {
      continue;
    }
    onEvent(event);
  }
  return buffer;
}

export function streamError(event: CaseStreamEvent): string | undefined {
  if (event.type === "summary_log" && event.content?.startsWith("Error:")) {
    return event.content.slice("Error:".length).trim();
  }
  return undefined;
}
