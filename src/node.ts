import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

type FetchHandler = (request: Request) => Response | Promise<Response>;

/** Adapt a `fetch` handler to a `node:http` request listener. */
export function toNodeListener(
  handler: FetchHandler,
): (incoming: IncomingMessage, outgoing: ServerResponse) => Promise<void> {
  return async (incoming, outgoing) => {
    const controller = new AbortController();
    outgoing.once("close", () => controller.abort());
    const response = await handler(toRequest(incoming, controller.signal));
    const headers = new Headers(response.headers);
    const cookies = headers.getSetCookie();
    headers.delete("set-cookie");
    const rawHeaders = [
      ...[...headers].flat(),
      ...cookies.flatMap((cookie) => ["set-cookie", cookie]),
    ];
    outgoing.writeHead(response.status, rawHeaders);
    if (response.body === null) {
      outgoing.end();
    } else {
      await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), outgoing);
    }
  };
}

function toRequest(incoming: IncomingMessage, signal: AbortSignal): Request {
  const host = incoming.headers.host ?? "localhost";
  const url = new URL(incoming.url!, `http://${host}`);
  const headers = new Headers();
  for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
    headers.append(incoming.rawHeaders[index]!, incoming.rawHeaders[index + 1]!);
  }
  const method = incoming.method!;
  const init: RequestInit & { duplex?: "half" } = { method, headers, signal };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  return new Request(url, init);
}
