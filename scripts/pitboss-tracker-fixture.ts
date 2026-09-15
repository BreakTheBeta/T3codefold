import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const baseUrl = process.env.T3_PITBOSS_TRACKER_URL ?? "http://127.0.0.1:18456";
const url = new URL(baseUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw new Error("This fixture only creates accounts on a loopback test tracker.");
async function request(
  path: string,
  body: unknown,
  token?: string,
  method: "POST" | "PUT" = "POST",
) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Fixture request ${path} failed: HTTP ${response.status}`);
  return (await response.json()) as { id: number; token: string };
}
const username = `pitboss-${NodeCrypto.randomBytes(6).toString("hex")}`;
const password = NodeCrypto.randomBytes(24).toString("base64url");
await request("/register", { username, password, email: `${username}@example.test` });
const login = await request("/login", { username, password });
const project = await request(
  "/projects",
  { title: "Pitboss verification fixture" },
  login.token,
  "PUT",
);
const task = await request(
  `/projects/${project.id}/tasks`,
  {
    title: "Verify tracker reconciliation",
    description: "Source completion must stay distinct from accepted work.",
    priority: 3,
  },
  login.token,
  "PUT",
);
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const read = await request(
  "/tokens",
  { title: "Pitboss read only", permissions: { tasks: ["read_all"] }, expires_at: expiresAt },
  login.token,
  "PUT",
);
const update = await request(
  "/tokens",
  { title: "Fixture mutation", permissions: { tasks: ["update"] }, expires_at: expiresAt },
  login.token,
  "PUT",
);
const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-pitboss-tracker-"));
const file = NodePath.join(directory, "fixture.json");
await NodeFSP.writeFile(
  file,
  JSON.stringify({
    baseUrl,
    token: read.token,
    updateToken: update.token,
    projectId: project.id,
    taskId: task.id,
  }),
  { mode: 0o600 },
);
// Only the private file path leaves this script, never either credential.
console.log(file);
