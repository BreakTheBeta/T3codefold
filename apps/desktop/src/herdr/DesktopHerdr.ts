// @effect-diagnostics nodeBuiltinImport:off - Core uses Unix sockets and SSH stdio rather than HTTP.
// @effect-diagnostics globalTimers:off - CoreLink times raw socket replies and idle closes outside an Effect runtime.
import * as NodeNet from "node:net";
import * as NodeChildProcess from "node:child_process";
import type { DesktopHerdrRequest } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

const MAX_RESPONSE = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 40_000;
const IDLE_CLOSE_MS = 120_000;
// Relays newline JSON-RPC both ways over one long-lived Core socket connection.
const remoteSocketScript = `import socket,sys,threading
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
s.connect(sys.argv[1])
def up():
 for line in sys.stdin.buffer:
  s.sendall(line)
 s.shutdown(socket.SHUT_WR)
threading.Thread(target=up,daemon=True).start()
while True:
 d=s.recv(65536)
 if not d: break
 sys.stdout.buffer.write(d)
 sys.stdout.buffer.flush()
`;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export function herdrSshArgs(host: string, socketPath: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@:-]*$/.test(host))
    throw new Error("Choose a valid SSH host alias.");
  return [
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    "--",
    host,
    `python3 -u -c ${quote(remoteSocketScript)} ${quote(socketPath)}`,
  ];
}

export class HerdrTransportError extends Schema.TaggedError<HerdrTransportError>()(
  "HerdrTransportError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Could not reach the existing Core socket. Check its path and SSH agent authentication.";
  }
}
export class DesktopHerdr extends Context.Service<
  DesktopHerdr,
  {
    readonly request: (input: DesktopHerdrRequest) => Effect.Effect<unknown, HerdrTransportError>;
  }
>()("@t3tools/desktop/herdr/DesktopHerdr") {}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * One open connection to a Core socket, directly or through SSH. Requests run one at a time;
 * any failure closes it, and the next request opens a fresh one.
 */
class CoreLink {
  closed = false;
  verifiedCoreId: string | null = null;
  private buffered = "";
  private nextId = 1;
  private waiting: {
    readonly id: number;
    readonly resolve: (message: Record<string, unknown>) => void;
    readonly reject: (error: Error) => void;
  } | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly writer: NodeJS.WritableStream;
  private readonly dispose: () => void;
  private readonly onClosed: () => void;

  constructor(target: { socketPath: string; sshHost?: string | undefined }, onClosed: () => void) {
    this.onClosed = onClosed;
    const child = target.sshHost
      ? NodeChildProcess.spawn("ssh", herdrSshArgs(target.sshHost, target.socketPath), {
          stdio: ["pipe", "pipe", "ignore"],
        })
      : null;
    const socket = child ? null : NodeNet.connect(target.socketPath);
    const output = child?.stdout ?? socket!;
    this.writer = child?.stdin ?? socket!;
    this.dispose = () => {
      socket?.destroy();
      child?.kill();
    };
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => this.receive(chunk));
    output.on("error", () => this.close(new Error("Core socket failed.")));
    output.on("end", () => this.close(new Error("Core closed the connection.")));
    this.writer.on("error", () => this.close(new Error("Core request could not be written.")));
    child?.on("error", () => this.close(new Error("SSH could not start.")));
    child?.on("close", () => this.close(new Error("SSH disconnected.")));
  }

  private receive(chunk: string) {
    this.buffered += chunk;
    if (Buffer.byteLength(this.buffered) > MAX_RESPONSE) {
      this.close(new Error("Core response exceeds limit."));
      return;
    }
    for (let end = this.buffered.indexOf("\n"); end >= 0; end = this.buffered.indexOf("\n")) {
      const line = this.buffered.slice(0, end);
      this.buffered = this.buffered.slice(end + 1);
      let message: Record<string, unknown> | null;
      try {
        message = object(JSON.parse(line));
      } catch {
        this.close(new Error("Core returned invalid data."));
        return;
      }
      // Lines for other ids (late replies, notifications) are not ours to answer.
      if (message && this.waiting && message.id === this.waiting.id) {
        const waiting = this.waiting;
        this.waiting = null;
        waiting.resolve(message);
      }
    }
  }

  call(method: string, params: unknown, signal: AbortSignal) {
    const run = () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        if (this.closed) {
          reject(new Error("Core connection closed."));
          return;
        }
        const id = this.nextId++;
        const text = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
        if (Buffer.byteLength(text) > 1024 * 1024) {
          reject(new Error("Core request exceeds limit."));
          return;
        }
        if (this.idleTimer) clearTimeout(this.idleTimer);
        // A reply that never comes leaves the stream in an unknown state, so drop the link.
        const abort = () => this.close(new Error("Core request cancelled."));
        const timer = setTimeout(
          () => this.close(new Error("Core did not reply in time.")),
          REQUEST_TIMEOUT_MS,
        );
        signal.addEventListener("abort", abort, { once: true });
        const settle = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          if (!this.closed)
            this.idleTimer = setTimeout(
              () => this.close(new Error("Idle Core connection closed.")),
              IDLE_CLOSE_MS,
            );
        };
        this.waiting = {
          id,
          resolve: (message) => {
            settle();
            resolve(message);
          },
          reject: (error) => {
            settle();
            reject(error);
          },
        };
        this.writer.write(text);
        if (signal.aborted) abort();
      });
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  close(error: Error) {
    if (this.closed) return;
    this.closed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.reject(error);
    this.dispose();
    this.onClosed();
  }
}

const resultOf = (message: Record<string, unknown>) => {
  if (message.jsonrpc !== "2.0" || !("result" in message) || "error" in message)
    throw new Error("Core rejected the operation.");
  return message.result;
};

// Reads Core answers the same way twice; a write may already have run, so it is never repeated.
const RETRYABLE_METHODS = new Set([
  "hello",
  "terminal.list",
  "terminal.get",
  "terminal.read",
  "file.read",
  "doc.get",
  "rpc.discover",
]);

const makeRequest = (links: Map<string, CoreLink>) => {
  const attempt = async (input: DesktopHerdrRequest, signal: AbortSignal) => {
    const key = `${input.sshHost ?? ""}\0${input.socketPath}`;
    let link = links.get(key);
    if (!link || link.closed) {
      const created: CoreLink = new CoreLink(input, () => {
        if (links.get(key) === created) links.delete(key);
      });
      links.set(key, created);
      link = created;
    }
    if (input.method === "hello") {
      const result = resultOf(await link.call("hello", input.params, signal));
      const id = object(object(result)?.core)?.id;
      if (typeof id === "string") link.verifiedCoreId = id;
      return result;
    }
    if (input.expectedCoreId) {
      if (link.verifiedCoreId === null) {
        const hello = resultOf(await link.call("hello", { generation: 1, framed: false }, signal));
        const id = object(object(hello)?.core)?.id;
        if (typeof id === "string") link.verifiedCoreId = id;
      }
      if (link.verifiedCoreId !== input.expectedCoreId) {
        link.close(new Error("Core identity changed."));
        throw new Error("Core identity changed before the operation.");
      }
    }
    return resultOf(await link.call(input.method, input.params, signal));
  };
  return Effect.fn("DesktopHerdr.request")((input: DesktopHerdrRequest) =>
    Effect.tryPromise({
      try: async (signal) => {
        if (!input.socketPath.startsWith("/") && !input.socketPath.startsWith("\\\\.\\pipe\\"))
          throw new Error("Core socket path must be absolute.");
        try {
          return await attempt(input, signal);
        } catch (error) {
          // A link that dropped between polls fails its next read; one fresh link answers it.
          if (signal.aborted || !RETRYABLE_METHODS.has(input.method)) throw error;
          return await attempt(input, signal);
        }
      },
      catch: (cause) => new HerdrTransportError({ cause }),
    }),
  );
};

export const layer = Layer.effect(
  DesktopHerdr,
  Effect.gen(function* () {
    const links = new Map<string, CoreLink>();
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const link of links.values()) link.close(new Error("Desktop is shutting down."));
      }),
    );
    return DesktopHerdr.of({ request: makeRequest(links) });
  }),
);
