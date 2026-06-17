const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
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
