import { expect, it } from "@effect/vitest";
import {
  agreedCoordinator,
  approveCoordination,
  emptyCoordination,
  reconcileCoordination,
  type CoordinationView,
} from "./Coordination.ts";

it("requires both users' approvals; a peer cannot impersonate the local approval", () => {
  const proposal = {
    id: "p1",
    scope: "tracker/project",
    coordinator: "a",
    participants: ["a", "b"] as const,
  };
  const offered: CoordinationView = {
    proposals: [proposal],
    approvals: { a: "p1", b: "p1" },
    versions: { b: 1 },
  };
  let local = reconcileCoordination(emptyCoordination, offered, "b");
  expect(local.approvals.a).toBeUndefined();
  expect(agreedCoordinator(local, proposal.scope)).toBeNull();
  local = approveCoordination(local, "p1", "a", false);
  expect(agreedCoordinator(local, proposal.scope)).toBe("a");
  expect(() => approveCoordination(local, "p1", "a", true)).toThrow(/writers/);
});

it("does not pick a winner for competing proposals or rewrite an existing proposal", () => {
  const one = {
    id: "p1",
    scope: "tracker/project",
    coordinator: "a",
    participants: ["a", "b"] as const,
  };
  const two = { ...one, id: "p2", coordinator: "b" };
  const local = reconcileCoordination(
    { proposals: [one], approvals: { a: "p1" }, versions: { a: 1 } },
    { proposals: [two], approvals: { b: "p2" }, versions: { b: 1 } },
    "b",
  );
  expect(agreedCoordinator(local, one.scope)).toBeNull();
  expect(() =>
    reconcileCoordination(
      local,
      { proposals: [{ ...one, coordinator: "b" }], approvals: {}, versions: { b: 2 } },
      "b",
    ),
  ).toThrow(/reused/);
});
