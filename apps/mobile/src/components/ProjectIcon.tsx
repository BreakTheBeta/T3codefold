import type { ProjectIconColor, ProjectIconOverride } from "@t3tools/contracts";
import {
  PROJECT_ICON_COLOR_BY_NAME,
  selectProjectIcon,
  type ProjectIconName,
} from "@t3tools/shared/projectIconModel";
import * as Lucide from "lucide-react-native";
import { Text, useColorScheme } from "react-native";

const AUTOMATIC_NAMES: Record<ProjectIconName, string> = {
  ai: "bot",
  book: "book-open",
  braces: "braces",
  circuit: "circuit-board",
  cloud: "cloud-cog",
  code: "code-2",
  database: "database",
  desktop: "monitor",
  "folder-code": "folder-code",
  game: "gamepad-2",
  image: "image",
  layers: "layers-3",
  mobile: "smartphone",
  music: "music",
  package: "package",
  security: "shield-check",
  server: "server",
  shopping: "shopping-bag",
  terminal: "terminal",
  test: "flask-conical",
  video: "video",
  web: "globe-2",
};

// Tailwind's 600/400 shades match desktop in light/dark mode.
const COLORS: Record<ProjectIconColor, readonly [string, string]> = {
  gray: ["#4b5563", "#9ca3af"],
  red: ["#dc2626", "#f87171"],
  orange: ["#ea580c", "#fb923c"],
  amber: ["#d97706", "#fbbf24"],
  yellow: ["#ca8a04", "#facc15"],
  lime: ["#65a30d", "#a3e635"],
  green: ["#16a34a", "#4ade80"],
  emerald: ["#059669", "#34d399"],
  teal: ["#0d9488", "#2dd4bf"],
  cyan: ["#0891b2", "#22d3ee"],
  sky: ["#0284c7", "#38bdf8"],
  blue: ["#2563eb", "#60a5fa"],
  indigo: ["#4f46e5", "#818cf8"],
  violet: ["#7c3aed", "#a78bfa"],
  purple: ["#9333ea", "#c084fc"],
  fuchsia: ["#c026d3", "#e879f9"],
  pink: ["#db2777", "#f472b6"],
  rose: ["#e11d48", "#fb7185"],
};

export function ProjectIcon(props: {
  projectTitle: string;
  workspaceRoot?: string | null;
  projectIcon?: ProjectIconOverride | null;
  size: number;
}) {
  const dark = useColorScheme() === "dark";
  const automatic = selectProjectIcon(props.projectTitle, props.workspaceRoot ?? "");
  const override = props.projectIcon;
  if (override?.kind === "emoji") {
    return (
      <Text
        allowFontScaling={false}
        style={{ fontSize: props.size * 0.8, lineHeight: props.size, textAlign: "center" }}
      >
        {override.emoji}
      </Text>
    );
  }
  const name = override?.kind === "lucide" ? override.name : AUTOMATIC_NAMES[automatic.icon];
  const color =
    override?.kind === "lucide" ? override.color : PROJECT_ICON_COLOR_BY_NAME[automatic.icon];
  // Use the suffixed exports so names can only resolve to icons, never library helpers.
  const exportName =
    name.replace(/(^|-)([a-z0-9])/g, (_, _separator: string, letter: string) =>
      letter.toUpperCase(),
    ) + "Icon";
  const Icon =
    (Lucide[exportName as keyof typeof Lucide] as Lucide.LucideIcon | undefined) ??
    Lucide.FolderCode;
  return <Icon size={props.size * 0.85} color={COLORS[color][dark ? 1 : 0]} />;
}
