import { DesktopHerdrRequest } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as DesktopHerdr from "../../herdr/DesktopHerdr.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import * as IpcChannels from "../channels.ts";

export const herdrRequest = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.HERDR_REQUEST_CHANNEL,
  payload: DesktopHerdrRequest,
  result: Schema.Unknown,
  handler: Effect.fn("desktop.ipc.herdr.request")(function* (input) {
    const herdr = yield* DesktopHerdr.DesktopHerdr;
    return yield* herdr.request(input);
  }),
});
