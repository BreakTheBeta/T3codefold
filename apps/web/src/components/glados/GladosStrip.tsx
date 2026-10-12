import { useNavigate } from "@tanstack/react-router";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { CrownIcon } from "lucide-react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";

/** Marks the GLaDOS thread under the chat header, with a way to its settings. */
export function GladosStrip(props: { environmentId: EnvironmentId; threadId: ThreadId }) {
  const navigate = useNavigate();
  const isGlados = useEnvironmentSettings(
    props.environmentId,
    (settings) => settings.gladosThreadId === props.threadId,
  );
  if (!isGlados) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5 text-sm">
      <CrownIcon className="size-4 text-warning" />
      <span className="font-semibold">GLaDOS</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        Plans with you and hands work to delegated agents
      </span>
      <Button
        size="compact"
        variant="ghost"
        onClick={() =>
          void navigate({ to: "/settings/glados", search: { machine: props.environmentId } })
        }
      >
        Instructions
      </Button>
    </div>
  );
}
