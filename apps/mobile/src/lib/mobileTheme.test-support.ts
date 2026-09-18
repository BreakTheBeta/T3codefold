import * as NodeFS from "node:fs";

import type { MobileThemeAppearance, MobileThemeVariables } from "./mobileTheme";

export function readDefaultMobileThemeVariables(
  appearance: MobileThemeAppearance,
): MobileThemeVariables {
  const stylesheet = NodeFS.readFileSync(new URL("../../global.css", import.meta.url), "utf8");
  const variant = new RegExp(`@variant ${appearance} \\{([\\s\\S]*?)\\n    \\}`, "u").exec(
    stylesheet,
  )?.[1];
  if (variant === undefined) throw new Error(`Missing default ${appearance} theme in global.css.`);

  // Imported defaults include Clerk's build-time colors. Local default tokens override them.
  const importedStylesheet = NodeFS.readFileSync(
    new URL("../../generated-uniwind-themes.css", import.meta.url),
    "utf8",
  );
  const importedVariant =
    new RegExp(`@variant ${appearance} \\{([\\s\\S]*?)\\n    \\}`, "u").exec(
      importedStylesheet,
    )?.[1] ?? "";
  return Object.fromEntries(
    Array.from(
      `${importedVariant}\n${variant}`.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/gu),
      ([, name, value]) => [name, (value ?? "").trim()],
    ).filter(([name]) => !name?.startsWith("--color-adaptive-")),
  ) as MobileThemeVariables;
}
