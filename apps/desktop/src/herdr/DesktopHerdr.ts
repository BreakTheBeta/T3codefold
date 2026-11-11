// @effect-diagnostics nodeBuiltinImport:off - Core uses Unix sockets and SSH stdio rather than HTTP.
import * as NodeNet from "node:net";
import * as NodeChildProcess from "node:child_process";
import type { DesktopHerdrRequest } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

const MAX_RESPONSE = 8 * 1024 * 1024;
const remoteSocketScript = `import socket,sys
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
s.settimeout(35)
s.connect(sys.argv[1])
f=s.makefile('rb')
for _ in range(2):
 line=sys.stdin.buffer.readline(1048576)
 if not line: break
 s.sendall(line)
 result=f.readline(8388609)
 if len(result)>8388608: raise RuntimeError('Core response too large')
 sys.stdout.buffer.write(result)
 sys.stdout.buffer.flush()
s.close()
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

const request = Effect.fn("DesktopHerdr.request")((input: DesktopHerdrRequest) =>
  Effect.tryPromise({
    try: (signal) =>
      new Promise<unknown>((resolve, reject) => {
        if (!input.socketPath.startsWith("/") && !input.socketPath.startsWith("\\\\.\\pipe\\")) {
          reject(new Error("Core socket path must be absolute."));
          return;
        }
        const text = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: input.method, params: input.params })}\n`;
        if (Buffer.byteLength(text) > 1024 * 1024) {
          reject(new Error("Core request exceeds limit."));
          return;
        }
        const child = input.sshHost
          ? NodeChildProcess.spawn("ssh", herdrSshArgs(input.sshHost, input.socketPath), {
              stdio: ["pipe", "pipe", "ignore"],
            })
          : null;
        const socket = child ? null : NodeNet.connect(input.socketPath);
        const output = child?.stdout ?? socket!;
        const writer = child?.stdin ?? socket!;
        let pending = "";
        let handshaking = !!input.expectedCoreId && input.method !== "hello";
        let settled = false;
        const cleanup = () => {
          signal.removeEventListener("abort", abort);
          socket?.destroy();
          child?.kill();
        };
        const finish = (error?: Error, result?: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else resolve(result);
        };
        const abort = () => finish(new Error("Core request cancelled."));
        signal.addEventListener("abort", abort, { once: true });
        output.setEncoding("utf8");
        output.on("data", (chunk: string) => {
          pending += chunk;
          if (Buffer.byteLength(pending) > MAX_RESPONSE) {
            finish(new Error("Core response exceeds limit."));
            return;
          }
          const end = pending.indexOf("\n");
          if (end < 0) return;
          try {
            const message: unknown = JSON.parse(pending.slice(0, end));
            pending = pending.slice(end + 1);
            if (handshaking) {
              if (
                !message ||
                typeof message !== "object" ||
                !("id" in message) ||
                message.id !== 0 ||
                !("result" in message) ||
                !message.result ||
                typeof message.result !== "object" ||
                !("core" in message.result) ||
                !message.result.core ||
                typeof message.result.core !== "object" ||
                !("id" in message.result.core) ||
                message.result.core.id !== input.expectedCoreId
              ) {
                finish(new Error("Core identity changed before the operation."));
                return;
              }
              handshaking = false;
              writer.write(text);
              return;
            }
            if (
              !message ||
              typeof message !== "object" ||
              !("jsonrpc" in message) ||
              message.jsonrpc !== "2.0" ||
              !("id" in message) ||
              message.id !== 1 ||
              !("result" in message) ||
              "error" in message
            ) {
              throw new Error("Core rejected the operation.");
            }
            finish(undefined, message.result);
          } catch {
            finish(new Error("Core rejected the operation or returned invalid data."));
          }
        });
        output.on("error", () => finish(new Error("Core socket failed.")));
        writer.on("error", () => finish(new Error("Core request could not be written.")));
        output.on("end", () => finish(new Error("Core closed before replying.")));
        child?.on("error", () => finish(new Error("SSH could not start.")));
        child?.on("close", () => finish(new Error("SSH disconnected before replying.")));
        const first = handshaking
          ? `${JSON.stringify({ jsonrpc: "2.0", id: 0, method: "hello", params: { generation: 1, framed: false } })}\n`
          : text;
        if (socket) socket.once("connect", () => writer.write(first));
        else writer.write(first);
        if (signal.aborted) abort();
      }),
    catch: (cause) => new HerdrTransportError({ cause }),
  }).pipe(
    Effect.timeout("40 seconds"),
    Effect.mapError((cause) => new HerdrTransportError({ cause })),
  ),
);
export const layer = Layer.succeed(DesktopHerdr, DesktopHerdr.of({ request }));
