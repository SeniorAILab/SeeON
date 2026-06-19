import { BACKEND_ORIGIN as backendOrigin } from "../../../lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server demo predicate (see src/lib/config.ts isServerDemo). In a route handler
// process.env.DEMO is readable; client demo never opens this route (sse.ts uses
// the mock scheduler), but we still guard so a stray EventSource cannot reach
// the backend in demo mode.
function isServerDemo(): boolean {
  return process.env.DEMO === "1" || process.env.NEXT_PUBLIC_DEMO === "1";
}

export async function GET(request: Request): Promise<Response> {
  if (isServerDemo()) {
    // Benign, self-contained stream: a single comment then keep-alive heartbeats.
    // No upstream fetch, no backend dependency.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": demo-stream\n\n"));
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15_000);
        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        connection: "keep-alive",
      },
    });
  }

  const headers: HeadersInit = {
    accept: "text/event-stream",
    cookie: request.headers.get("cookie") ?? "",
  };
  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) headers["last-event-id"] = lastEventId;

  const upstream = await fetch(`${backendOrigin}/api/sse`, {
    headers,
    cache: "no-store",
    signal: request.signal,
  });

  if (!upstream.body) {
    return new Response(null, {
      status: upstream.status,
      headers: { "cache-control": "no-store" },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = upstream.body!.getReader();
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": proxy-connected\n\n"));

      request.signal.addEventListener("abort", () => {
        void reader.cancel().catch(() => undefined);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      })();
    },
  });

  return new Response(stream, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
