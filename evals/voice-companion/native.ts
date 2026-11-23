// Native stdio RPC callbacks run outside Effect; timers bound requests and owned-child cleanup.
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeChildProcess from "node:child_process";
import * as NodeReadline from "node:readline";

type Frame = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code?: number; message: string };
};

export function openNativeClient(cwd: string, model?: string) {
  const configured: unknown = JSON.parse(
    NodeChildProcess.execFileSync("codex", ["mcp", "list", "--json"], {
      cwd,
      encoding: "utf8",
      timeout: 15_000,
    }),
  );
  if (!Array.isArray(configured)) throw new Error("Could not enumerate native MCP configuration.");
  const names = configured.map((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("name" in entry) ||
      typeof entry.name !== "string"
    )
      throw new Error("Invalid native MCP server name.");
    return entry.name;
  });
  const child = NodeChildProcess.spawn(
    "codex",
    [
      ...(names.length
        ? [
            "-c",
            `mcp_servers={${names.map((name) => `${JSON.stringify(name)}={enabled=false}`).join(",")}}`,
          ]
        : []),
      ...names.flatMap((name) =>
        name.includes(".") || name.includes("=") ? [] : ["-c", `mcp_servers.${name}.enabled=false`],
      ),
      "-c",
      "features.realtime_conversation=true",
      "-c",
      "features.plugins=false",
      "-c",
      "features.connectors=false",
      "-c",
      "features.apps=false",
      "-c",
      "features.hooks=false",
      "-c",
      "features.codex_hooks=false",
      ...(model ? ["-c", `model=${JSON.stringify(model)}`] : []),
      "app-server",
    ],
    { cwd, stdio: ["pipe", "pipe", "pipe"] },
  );
  const pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  const listeners = new Set<(frame: Frame) => void>();
  let nextId = 0;
  const send = (frame: Frame) => child.stdin.write(JSON.stringify(frame) + "\n");
  const fail = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    for (const listener of listeners)
      listener({ method: "eval/process-error", params: { message: error.message } });
  };
  child.stderr.resume();
  child.on("error", fail);
  child.on("exit", (code, signal) =>
    fail(new Error(`Native app-server exited (${code ?? signal}).`)),
  );
  const lines = NodeReadline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let frame: Frame;
    try {
      frame = JSON.parse(line);
    } catch {
      fail(new Error("Native app-server emitted invalid JSON."));
      return;
    }
    if (typeof frame.id === "number" && !frame.method) {
      const request = pending.get(frame.id);
      pending.delete(frame.id);
      if (frame.error) request?.reject(new Error(frame.error.message));
      else request?.resolve(frame.result ?? {});
    } else for (const listener of listeners) listener(frame);
  });
  return {
    send,
    subscribe(listener: (frame: Frame) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async request(method: string, params: Record<string, unknown>, timeout = 30_000) {
      const id = ++nextId;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await new Promise<Record<string, unknown>>((resolve, reject) => {
          pending.set(id, { resolve, reject });
          timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`${method} timed out.`));
          }, timeout);
          send({ id, method, params });
        });
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      lines.close();
      child.stdin.end();
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill("SIGTERM");
      });
    },
  };
}
