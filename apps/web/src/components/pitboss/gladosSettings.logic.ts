import type { PitbossSourceConfig } from "@t3tools/contracts";

export const LINEAR_API_URL = "https://api.linear.app";

/** A connection name for a new source when the user leaves it blank: the tracker kind, numbered if taken. */
export function sourceConnectionName(
  kind: PitbossSourceConfig["kind"],
  existingIds: ReadonlyArray<string>,
): string {
  const taken = new Set(existingIds);
  if (!taken.has(kind)) return kind;
  let index = 2;
  while (taken.has(`${kind}-${index}`)) index += 1;
  return `${kind}-${index}`;
}
