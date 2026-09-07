import { WsRpcGroup } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type * as Headers from "effect/unstable/http/Headers";
import { RpcClient, type Rpc, type RpcGroup } from "effect/unstable/rpc";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";

export const makeWsRpcProtocolClient = RpcClient.make(WsRpcGroup);

/** The session uses ordinary Effect/Stream calls, never queue or discard RPC modes. */
export type WsRpcProtocolClient = {
  readonly [Current in RpcGroup.Rpcs<typeof WsRpcGroup> as Current["_tag"]]: (
    input: Rpc.PayloadConstructor<Current>,
    options?: { readonly headers?: Headers.Input },
  ) => Rpc.Success<Current> extends Stream.Stream<infer A, infer E, infer R>
    ? Stream.Stream<A, E | Rpc.Error<Current> | RpcClientError, R>
    : Effect.Effect<Rpc.Success<Current>, Rpc.Error<Current> | RpcClientError>;
};
