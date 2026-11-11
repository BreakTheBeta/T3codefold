// @effect-diagnostics nodeBuiltinImport:off - The fixture is a real isolated Core-compatible socket.
import * as NodeNet from "node:net";
import * as NodeFSP from "node:fs/promises";
import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { DesktopHerdr, layer, herdrSshArgs } from "./DesktopHerdr.ts";

const list = (socketPath: string) =>
  Effect.gen(function* () {
    const core = yield* DesktopHerdr;
    return yield* core.request({
      socketPath,
      expectedCoreId: "test",
      method: "terminal.list",
      params: { all: true },
    });
  });

/** A Core-compatible socket that replies in split chunks and can drop a connection. */
const withCore = <A, E>(
  body: (fixture: {
    readonly socketPath: string;
    readonly requests: Array<{ id: number; method: string }>;
    readonly connections: () => number;
    readonly dropConnections: () => Effect.Effect<void>;
  }) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const dir = yield* Effect.promise(() => NodeFSP.mkdtemp("/tmp/t3-hc-"));
    const socketPath = `${dir}/core.sock`;
    const sockets = new Set<NodeNet.Socket>();
    const requests: Array<{ id: number; method: string }> = [];
    let connections = 0;
    const server = NodeNet.createServer((socket) => {
      connections++;
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      let input = "";
      socket.on("data", (bytes) => {
        input += bytes.toString();
        for (let end = input.indexOf("\n"); end >= 0; end = input.indexOf("\n")) {
          const request = JSON.parse(input.slice(0, end)) as { id: number; method: string };
          input = input.slice(end + 1);
          requests.push({ id: request.id, method: request.method });
          const response = JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result:
              request.method === "hello"
                ? { generation: 1, core: { id: "test" } }
                : { terminals: [] },
          });
          socket.write(response.slice(0, 8));
          socket.write(`${response.slice(8)}\n`);
        }
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
      return yield* body({
        socketPath,
        requests,
        connections: () => connections,
        dropConnections: () =>
          Effect.promise(() =>
            Promise.all(
              [...sockets].map(
                (socket) =>
                  new Promise<void>((resolve) => {
                    socket.once("close", () => resolve());
                    socket.destroy();
                  }),
              ),
            ).then(() => undefined),
          ),
      });
    } finally {
      for (const socket of sockets) socket.destroy();
      yield* Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve())));
      yield* Effect.promise(() => NodeFSP.rm(dir, { recursive: true, force: true }));
    }
  });

describe("desktop native Core transport", () => {
  it.live("reuses one verified connection for split replies without launching Core", () =>
    withCore(({ socketPath, requests, connections }) =>
      Effect.gen(function* () {
        expect(yield* list(socketPath)).toEqual({ terminals: [] });
        expect(yield* list(socketPath)).toEqual({ terminals: [] });
        expect(connections()).toBe(1);
        expect(requests.map((request) => request.method)).toEqual([
          "hello",
          "terminal.list",
          "terminal.list",
        ]);
      }).pipe(Effect.provide(layer)),
    ),
  );
  it.live("reconnects, re-verifies Core and answers the read after the connection drops", () =>
    withCore(({ socketPath, requests, connections, dropConnections }) =>
      Effect.gen(function* () {
        expect(yield* list(socketPath)).toEqual({ terminals: [] });
        yield* dropConnections();
        expect(yield* list(socketPath)).toEqual({ terminals: [] });
        expect(connections()).toBe(2);
        expect(requests.map((request) => request.method)).toEqual([
          "hello",
          "terminal.list",
          "hello",
          "terminal.list",
        ]);
      }).pipe(Effect.provide(layer)),
    ),
  );
  it("keeps SSH hosts out of options and quotes the remote socket as data", () => {
    expect(() => herdrSshArgs("-oProxyCommand=bad", "/socket")).toThrow();
    const args = herdrSshArgs("factory-host", "/path/it's a socket");
    expect(args.slice(-3, -1)).toEqual(["--", "factory-host"]);
    expect(
      args.slice(0, -3).every((arg) => arg === "-T" || arg === "-o" || arg.includes("=")),
    ).toBe(true);
    expect(args.at(-1)).toContain("'\\''");
    expect(args.at(-1)).not.toContain("hc connect");
  });
});
