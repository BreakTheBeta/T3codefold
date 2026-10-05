/**
 * Fold-only pitboss (GLaDOS managed work) atoms. `createServerEnvironmentAtoms` spreads these in,
 * so clients read them from their `serverEnvironment` alongside upstream's server atoms.
 */
import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";

import type * as EnvironmentRegistry from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createPitbossEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry.EnvironmentRegistry | R, E>,
) {
  return {
    pitbossPeers: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "pitboss:peers",
      tag: WS_METHODS.pitbossPeers,
    }),
    pitbossPeerCommand: createEnvironmentRpcCommand(runtime, {
      label: "pitboss:peer-command",
      tag: WS_METHODS.pitbossPeerCommand,
    }),
    pitbossSources: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "pitboss:sources",
      tag: WS_METHODS.pitbossSources,
    }),
    pitbossSourceCommand: createEnvironmentRpcCommand(runtime, {
      label: "pitboss:source-command",
      tag: WS_METHODS.pitbossSourceCommand,
    }),
    /** Live work snapshot: the full board on subscribe, then every server-side change. */
    pitbossLive: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:server:pitboss:live",
      tag: WS_METHODS.pitbossSubscribe,
    }),
    pitbossCommand: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:pitboss:command",
      tag: WS_METHODS.pitbossCommand,
    }),
  };
}
