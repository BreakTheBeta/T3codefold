// @effect-diagnostics nodeBuiltinImport:off - The fixture is a real isolated Core-compatible socket.
import * as NodeNet from "node:net";
import * as NodeFSP from "node:fs/promises";
import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { DesktopHerdr, layer, herdrSshArgs } from "./DesktopHerdr.ts";

const query = (socketPath: string) =>
  Effect.gen(function* () {
    const core = yield* DesktopHerdr;
    return yield* core.request({
      socketPath,
      expectedCoreId: "test",
      method: "terminal.list",
      params: { all: true },
    });
  }).pipe(Effect.provide(layer));

describe("desktop native Core transport", () => {
  it.live("reads a split JSON reply from an existing socket without launching Core", () =>
    Effect.gen(function* () {
      const dir = yield* Effect.promise(() => NodeFSP.mkdtemp("/tmp/t3-hc-"));
      const socketPath = `${dir}/core.sock`;
      const sockets = new Set<NodeNet.Socket>();
      const requests: unknown[] = [];
      const server = NodeNet.createServer((socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        let input = "";
        socket.on("data", (bytes) => {
          input += bytes.toString();
          if (!input.endsWith("\n")) return;
          const request = JSON.parse(input) as { id: number };
          input = "";
          requests.push(request);
          const response = JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: request.id === 0 ? { generation: 1, core: { id: "test" } } : { terminals: [] },
          });
          socket.write(response.slice(0, 8));
          socket.write(`${response.slice(8)}\n`);
        });
      });
      try {
        yield* Effect.promise(
          () =>
            new Promise<void>((resolve, reject) => {
              server.once("error", reject);
              server.listen(socketPath, resolve);
            }),
        );
        expect(yield* query(socketPath)).toEqual({ terminals: [] });
        expect(requests).toEqual([
          { jsonrpc: "2.0", id: 0, method: "hello", params: { generation: 1, framed: false } },
          { jsonrpc: "2.0", id: 1, method: "terminal.list", params: { all: true } },
        ]);
      } finally {
        for (const socket of sockets) socket.destroy();
        yield* Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve())));
        yield* Effect.promise(() => NodeFSP.rm(dir, { recursive: true, force: true }));
      }
    }),
  );
  it("keeps SSH hosts out of options and quotes the remote socket as data", () => {
    expect(() => herdrSshArgs("-oProxyCommand=bad", "/socket")).toThrow();
    const args = herdrSshArgs("factory-host", "/path/it's a socket");
    expect(args.slice(0, 8)).toEqual([
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "--",
      "factory-host",
      args[7],
    ]);
    expect(args[7]).toContain("'\\''");
    expect(args[7]).not.toContain("hc connect");
  });
});
