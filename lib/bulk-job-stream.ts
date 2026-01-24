import fs from "fs";

type StreamOptions = {
  worker?: string;
  onReady?: () => void;
};

export const streamLogFile = (
  getPath: () => string | null,
  { worker, onReady }: StreamOptions = {}
) => {
  const encoder = new TextEncoder();
  let position = 0;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      const emitLog = (line: string) => {
        send({ type: "log", worker, line });
      };

      const tick = () => {
        if (closed) return;
        const path = getPath();
        if (!path || !fs.existsSync(path)) {
          return;
        }
        try {
          const stat = fs.statSync(path);
          if (stat.size < position) {
            position = 0;
          }
          if (stat.size === position) return;
          const length = stat.size - position;
          const fd = fs.openSync(path, "r");
          const buffer = Buffer.alloc(length);
          fs.readSync(fd, buffer, 0, length, position);
          fs.closeSync(fd);
          position = stat.size;
          const text = buffer.toString("utf8");
          text
            .split(/\r?\n/)
            .filter(Boolean)
            .forEach((line) => emitLog(line));
        } catch {
          return;
        }
      };

      const interval = setInterval(tick, 900);
      tick();
      onReady?.();

      return () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};

