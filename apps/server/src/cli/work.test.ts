import { expect, it } from "@effect/vitest";
import { readWorkReply } from "./work.ts";
it("reads JSON and SSE MCP replies without treating notifications as results", () => {
  expect(readWorkReply('{"jsonrpc":"2.0","id":1,"result":{"revision":3}}')).toEqual({
    revision: 3,
  });
  expect(
    readWorkReply(
      'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"revision":4}}\n\n',
    ),
  ).toEqual({ revision: 4 });
});
it("rejects protocol errors instead of claiming completion", () => {
  expect(() => readWorkReply('{"jsonrpc":"2.0","id":1,"error":{"code":-32600}}')).toThrow(
    /rejected/,
  );
});
