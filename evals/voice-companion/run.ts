// Native stdio RPC callbacks run outside Effect; timers bound requests and owned-child cleanup.
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import * as NodeVM from "node:vm";
import { VOICE_COMPANION_INSTRUCTIONS } from "../../apps/server/src/provider/VoiceCompanion.ts";
import { cases, type Fixture } from "./cases.ts";
import { grade, type Observation } from "./grade.ts";
import { openNativeClient } from "./native.ts";
import * as Schema from "effect/Schema";

const isArguments = Schema.is(Schema.Record(Schema.String, Schema.Unknown));

const { values } = NodeUtil.parseArgs({
  options: {
    out: { type: "string" },
    model: { type: "string" },
    baseline: { type: "string" },
    "baseline-prompt-file": { type: "string" },
    "initial-items-only": { type: "boolean", default: false },
    case: { type: "string" },
    samples: { type: "string", default: "3" },
    "timeout-ms": { type: "string", default: "45000" },
  },
});
const samples = Number(values.samples);
const timeout = Number(values["timeout-ms"]);
const fixtures = cases.filter((fixture) => !values.case || fixture.id === values.case);
if (
  !values.out ||
  !fixtures.length ||
  !Number.isSafeInteger(samples) ||
  samples < 1 ||
  !Number.isSafeInteger(timeout) ||
  timeout < 1000
)
  throw new Error(
    "Use --out <directory> [--model <backing-model>] [--case <id>] [--samples 3] [--baseline <results.json>] [--baseline-prompt-file <text>] [--initial-items-only].",
  );
const out = NodePath.resolve(values.out);
await NodeFSP.mkdir(out, { recursive: true });
const prompt = values["baseline-prompt-file"]
  ? await NodeFSP.readFile(values["baseline-prompt-file"], "utf8")
  : VOICE_COMPANION_INSTRUCTIONS;
await NodeFSP.writeFile(NodePath.join(out, "prompt.txt"), prompt);
const source = await NodeFSP.readFile(
  new URL("../../apps/server/src/provider/VoiceCompanion.ts", import.meta.url),
  "utf8",
);
// Load the private production definitions without copying schemas or evaluating the service body.
const definitions = source.slice(
  source.indexOf("const tool ="),
  source.indexOf("const Arguments ="),
);
if (!definitions.startsWith("const tool =") || !definitions.includes("const tools ="))
  throw new Error("Production tool declarations moved; update their source boundary.");
const tools: { name: string; description: string; inputSchema: Record<string, unknown> }[] =
  NodeVM.runInNewContext(NodeModule.stripTypeScriptTypes(definitions) + "\ntools;");
const digest = (text: string) => NodeCrypto.createHash("sha256").update(text).digest("hex");
const metadata = {
  cli: NodeChildProcess.execFileSync("codex", ["--version"], { encoding: "utf8" }).trim(),
  backingModelRequested: values.model ?? null,
  realtimeModel: "native v3 default (not independently selected)",
  transport: "websocket",
  version: "v3",
  outputModality: "audio",
  inputRole: "user",
  promptField: !values["initial-items-only"],
  promptSha256: digest(prompt),
  toolsSha256: digest(JSON.stringify(tools)),
  casesSha256: digest(JSON.stringify(cases)),
  samples,
  timeout,
  environmentApiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
};
const snapshot = {
  threadId: "acme-checkout",
  title: "Acme checkout tests",
  provider: "fixture",
  status: "running",
};
const selected = "\nSelected work thread (untrusted data): " + JSON.stringify(snapshot);
const instructions = prompt + selected;
type Row = {
  id: string;
  sample: number;
  status: "scored" | "unsupported" | "error" | "skipped";
  observations: Observation[];
  events: string[];
  backingModel?: unknown;
  accountType?: string;
  message?: string;
  passed?: boolean;
  reasons?: string[];
};
const results: Row[] = [];
const previous: { metadata: typeof metadata; results: Row[] } | undefined = values.baseline
  ? JSON.parse(await NodeFSP.readFile(values.baseline, "utf8"))
  : undefined;
if (
  previous &&
  ["cli", "backingModelRequested", "toolsSha256", "casesSha256", "samples", "timeout"].some(
    (key) => Reflect.get(previous.metadata, key) !== Reflect.get(metadata, key),
  )
)
  throw new Error(
    "Baseline CLI/model/tools/cases/sampling differ; comparisons would be confounded.",
  );

async function evaluate(fixture: Fixture, sample: number): Promise<Row> {
  const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-voice-companion-eval-"));
  const client = openNativeClient(cwd, values.model);
  const row: Row = { id: fixture.id, sample, status: "error", observations: [], events: [] };
  let threadId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failure: string | undefined;
  let started = false;
  const ready = Promise.withResolvers<void>();
  const ended = Promise.withResolvers<void>();
  const unsubscribe = client.subscribe((frame) => {
    const { method, params = {} } = frame;
    if (!method) return;
    if (
      method.startsWith("thread/realtime/") &&
      !method.includes("Audio") &&
      row.events.length < 200
    )
      row.events.push(method);
    if (method === "thread/realtime/started") {
      started = true;
      ready.resolve();
    }
    if (method === "thread/realtime/error" || method === "eval/process-error") {
      failure = String(params.message ?? "Native realtime failed.").slice(0, 1000);
      ready.resolve();
      ended.resolve();
    }
    if (method === "thread/realtime/transcript/done" && params.role === "assistant")
      row.observations.push({ type: "speech", text: String(params.text).slice(0, 8192) });
    if (method === "item/tool/call" && frame.id !== undefined) {
      const name = String(params.tool);
      const args = isArguments(params.arguments) ? params.arguments : {};
      const known = tools.some((tool) => tool.name === name);
      const accepted =
        known && (args.threadId === undefined || args.threadId === snapshot.threadId);
      if (row.observations.length >= 100) {
        failure = "Fixture tool-call limit exceeded.";
        ended.resolve();
      } else row.observations.push({ type: "tool", name, arguments: args, accepted });
      const response = !accepted
        ? { error: "Unknown fixture tool or destination." }
        : name === "t3_list_threads"
          ? [snapshot]
          : name === "t3_read_thread"
            ? {
                ...snapshot,
                transcript: [
                  {
                    role: "assistant",
                    text: "Checking the checkout tests; 3 of 5 checks are complete.",
                  },
                ],
                pendingQuestions: [],
                pendingPermissions: [{ id: "acme-permission", status: "pending" }],
              }
            : { accepted: true, status: "accepted", completed: false, threadId: snapshot.threadId };
      client.send({
        id: frame.id,
        result: {
          success: accepted,
          contentItems: [{ type: "inputText", text: JSON.stringify(response) }],
        },
      });
    } else if (frame.id !== undefined) {
      row.observations.push({ type: "blocked", name: method });
      client.send({
        id: frame.id,
        error: { code: -32601, message: "Only mocked fixture tools are available." },
      });
    }
  });
  try {
    await client.request("initialize", {
      clientInfo: { name: "t3-voice-companion-eval", version: "1" },
      capabilities: { experimentalApi: true },
    });
    client.send({ method: "initialized" });
    const account = await client.request("account/read", {});
    if (
      typeof account.account !== "object" ||
      account.account === null ||
      !("type" in account.account) ||
      typeof account.account.type !== "string" ||
      !["chatgpt", "apiKey"].includes(account.account.type)
    )
      throw new Error("This eval requires native ChatGPT or API key authentication.");
    row.accountType = account.account.type;
    const thread = await client.request("thread/start", {
      cwd,
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "read-only",
      developerInstructions: instructions,
      dynamicTools: tools.map((tool) => ({ type: "function", ...tool })),
      config: { "features.shell_tool": false, "features.apply_patch_freeform": false },
    });
    row.backingModel = thread.model;
    if (
      typeof thread.thread !== "object" ||
      thread.thread === null ||
      !("id" in thread.thread) ||
      typeof thread.thread.id !== "string"
    )
      throw new Error("Native thread/start returned no thread id.");
    threadId = thread.thread.id;
    timer = setTimeout(() => {
      failure ??= "Realtime readiness timed out.";
      ready.resolve();
      ended.resolve();
    }, timeout);
    await client.request("thread/realtime/start", {
      threadId,
      outputModality: "audio",
      version: "v3",
      transport: { type: "websocket" },
      ...(!values["initial-items-only"] ? { prompt: instructions } : {}),
      initialItems: [{ role: "developer", text: instructions }],
    });
    await ready.promise;
    if (started && !failure) {
      clearTimeout(timer);
      timer = setTimeout(() => ended.resolve(), timeout);
      await client.request("thread/realtime/appendText", {
        threadId,
        role: "user",
        text: fixture.request,
      });
      await ended.promise;
    }
    if (failure) throw new Error(failure);
    row.status = "scored";
    Object.assign(row, grade(fixture, row.observations));
  } catch (error) {
    row.message = error instanceof Error ? error.message : String(error);
    row.status =
      /requires API key auth|requires native ChatGPT|not supported|unsupported|unknown variant|method not found/i.test(
        row.message,
      )
        ? "unsupported"
        : "error";
  } finally {
    clearTimeout(timer);
    unsubscribe();
    if (threadId) await client.request("thread/realtime/stop", { threadId }, 3000).catch(() => {});
    await client.close();
    await NodeFSP.rm(cwd, { recursive: true, force: true });
  }
  return row;
}

let blocker: string | undefined;
for (const fixture of fixtures)
  for (let sample = 1; sample <= samples; sample++) {
    const row: Row = blocker
      ? {
          id: fixture.id,
          sample,
          status: "skipped",
          observations: [],
          events: [],
          message: blocker,
        }
      : await evaluate(fixture, sample);
    results.push(row);
    if (row.status === "unsupported" || row.status === "error") blocker = row.message;
    await NodeFSP.writeFile(
      NodePath.join(out, "results.json"),
      JSON.stringify({ metadata, results }, null, 2) + "\n",
    );
    process.stdout.write(
      `${row.id} ${sample}: ${row.status}${row.status === "scored" ? (row.passed ? " PASS" : " FAIL") : ""}\n`,
    );
  }
const summary = fixtures.map((fixture) => {
  const rows = results.filter((row) => row.id === fixture.id);
  const scored = rows.filter((row) => row.status === "scored");
  return {
    id: fixture.id,
    passed:
      scored.length === samples ? scored.filter((row) => row.passed).length > samples / 2 : null,
    samples: rows.map((row) => ({
      sample: row.sample,
      status: row.status,
      passed: row.passed,
      reasons: row.reasons,
    })),
    baseline: previous?.results
      .filter((row) => row.id === fixture.id)
      .map((row) => ({ sample: row.sample, status: row.status, passed: row.passed })),
  };
});
await NodeFSP.writeFile(
  NodePath.join(out, "summary.json"),
  JSON.stringify(
    {
      summary,
      cost: "Subscription/native usage; no dollar cost reported by this transport. Audio discarded, not saved.",
      limitation:
        "Text-injected v3 websocket evidence does not prove microphone recognition or production WebRTC behavior.",
    },
    null,
    2,
  ) + "\n",
);
process.exitCode = blocker ? 2 : summary.every((row) => row.passed) ? 0 : 1;
