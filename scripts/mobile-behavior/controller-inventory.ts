import * as TypeScript from "typescript-legacy";
import type { GraphRoute } from "./controller-graph.ts";

export function controllerRoutes(source: string): GraphRoute[] {
  const file = TypeScript.createSourceFile(
    "Stack.tsx",
    source,
    TypeScript.ScriptTarget.Latest,
    true,
    TypeScript.ScriptKind.TSX,
  );
  const routes = new Map<string, GraphRoute>();
  const visit = (node: TypeScript.Node) => {
    if (
      TypeScript.isPropertyAssignment(node) &&
      TypeScript.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(file) === "createNativeStackScreen"
    ) {
      if (!TypeScript.isIdentifier(node.name) && !TypeScript.isStringLiteral(node.name))
        throw new Error("Computed route key needs an explicit audit inventory adapter.");
      let developmentOnly = false;
      for (let parent: TypeScript.Node | undefined = node.parent; parent; parent = parent.parent) {
        if (
          TypeScript.isConditionalExpression(parent) &&
          parent.condition.getText(file) === "__DEV__"
        )
          developmentOnly = true;
      }
      routes.set(node.name.text, { name: node.name.text, developmentOnly });
    }
    TypeScript.forEachChild(node, visit);
  };
  visit(file);
  if (!routes.size)
    throw new Error("No native stack routes found; refusing an empty coverage denominator.");
  return [...routes.values()];
}

export type ControllerMenuSite = {
  id: string;
  file: string;
  line: number;
  owner: string;
  kind: "menu" | "sheet" | "dialog" | "picker" | "submenu" | "route" | "overlay" | "system";
  title: string | null;
  dynamic: boolean;
  expression: string;
  developmentOnly: boolean;
};

export function androidControllerSources(paths: readonly string[]) {
  const eligible = paths.filter(
    (path) => /\.tsx?$/.test(path) && !/(?:\.ios|\.test|\.browser\.test|\.d)\.tsx?$/.test(path),
  );
  const variants = new Map<string, { path: string; priority: number }>();
  for (const path of eligible) {
    const key = path.replace(/\.(?:android|native)(?=\.tsx?$)/, "");
    const priority = /\.android\.tsx?$/.test(path) ? 2 : /\.native\.tsx?$/.test(path) ? 1 : 0;
    if ((variants.get(key)?.priority ?? -1) < priority) variants.set(key, { path, priority });
  }
  return [...variants.values()].map((entry) => entry.path).sort();
}

export function controllerMenuSites(path: string, source: string): ControllerMenuSite[] {
  const file = TypeScript.createSourceFile(
    path,
    source,
    TypeScript.ScriptTarget.Latest,
    true,
    TypeScript.ScriptKind.TSX,
  );
  const aliases = new Map<string, string>();
  for (const node of file.statements) {
    if (!TypeScript.isImportDeclaration(node) || !TypeScript.isStringLiteral(node.moduleSpecifier))
      continue;
    const bindings = node.importClause?.namedBindings;
    if (bindings && TypeScript.isNamedImports(bindings))
      for (const entry of bindings.elements)
        aliases.set(entry.name.text, entry.propertyName?.text ?? entry.name.text);
    if (bindings && TypeScript.isNamespaceImport(bindings))
      aliases.set(
        bindings.name.text,
        node.moduleSpecifier.text.split("/").at(-1) ?? bindings.name.text,
      );
  }
  const literal = (node: TypeScript.Node | undefined): string | null => {
    if (!node) return null;
    if (TypeScript.isStringLiteralLike(node)) return node.text;
    if (TypeScript.isJsxExpression(node)) return literal(node.expression);
    if (TypeScript.isObjectLiteralExpression(node)) {
      const title = node.properties.find(
        (property) =>
          TypeScript.isPropertyAssignment(property) && property.name.getText(file) === "title",
      );
      if (title && TypeScript.isPropertyAssignment(title)) return literal(title.initializer);
    }
    return null;
  };
  const kindOf = (name: string): ControllerMenuSite["kind"] | null => {
    if (name === "system") return "system";
    if (/Dialog$/.test(name)) return "dialog";
    if (/Menu$/.test(name) || name === "MenuView") return "menu";
    if (/Sheet$/.test(name)) return "sheet";
    if (/Picker$/.test(name)) return "picker";
    if (/^(?:Modal|Popover)$/.test(name)) return "overlay";
    return null;
  };
  const sites: ControllerMenuSite[] = [];
  const ordinals = new Map<string, number>();
  const add = (
    node: TypeScript.Node,
    kind: ControllerMenuSite["kind"],
    titleNode?: TypeScript.Node,
  ) => {
    let owner = "module";
    let developmentOnly = false;
    for (let parent: TypeScript.Node | undefined = node; parent; parent = parent.parent) {
      if (owner === "module" && TypeScript.isFunctionDeclaration(parent) && parent.name)
        owner = parent.name.text;
      if (
        owner === "module" &&
        TypeScript.isVariableDeclaration(parent) &&
        TypeScript.isIdentifier(parent.name) &&
        parent.initializer !== undefined &&
        (TypeScript.isArrowFunction(parent.initializer) ||
          TypeScript.isFunctionExpression(parent.initializer) ||
          TypeScript.isCallExpression(parent.initializer))
      )
        owner = parent.name.text;
      if (
        TypeScript.isConditionalExpression(parent) &&
        parent.condition.getText(file) === "__DEV__"
      )
        developmentOnly = true;
    }
    const key = `${path}:${owner}:${kind}`;
    const ordinal = (ordinals.get(key) ?? 0) + 1;
    ordinals.set(key, ordinal);
    const title = literal(titleNode);
    sites.push({
      id: `${key}:${ordinal}`,
      file: path,
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      owner,
      kind,
      title,
      dynamic: titleNode !== undefined && title === null,
      developmentOnly,
      expression: node.getText(file).slice(0, 1600),
    });
  };
  const visit = (node: TypeScript.Node) => {
    if (TypeScript.isJsxOpeningElement(node) || TypeScript.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(file);
      const kind = name.endsWith(".Screen") ? "route" : kindOf(aliases.get(name) ?? name);
      if (kind) {
        const attribute = node.attributes.properties.find(
          (property) =>
            TypeScript.isJsxAttribute(property) &&
            ["title", "name", "label"].includes(property.name.getText(file)),
        );
        add(
          node,
          kind,
          attribute && TypeScript.isJsxAttribute(attribute) ? attribute.initializer : undefined,
        );
      }
    } else if (TypeScript.isCallExpression(node)) {
      if (TypeScript.isPropertyAccessExpression(node.expression)) {
        const name = node.expression.expression.getText(file);
        const owner = aliases.get(name) ?? name;
        const action = node.expression.name.text;
        if (owner === "Dialog" && ["alert", "confirm", "prompt"].includes(action))
          add(node, "dialog", node.arguments[0]);
        else if (
          (owner === "Alert" && action === "alert") ||
          (owner === "Share" && action === "share") ||
          (owner === "Linking" && action === "openSettings")
        )
          add(node, "system", node.arguments[0]);
      }
      const name = node.expression.getText(file);
      const action = aliases.get(name) ?? name.split(".").at(-1);
      if (
        action &&
        [
          "getDocumentAsync",
          "launchImageLibraryAsync",
          "launchCameraAsync",
          "requestPermissionsAsync",
          "requestCameraPermissionsAsync",
          "requestMediaLibraryPermissionsAsync",
          "openAuthSessionAsync",
          "openBrowserAsync",
        ].includes(action)
      )
        add(node, "system", undefined);
    } else if (TypeScript.isObjectLiteralExpression(node)) {
      const properties = node.properties.filter(TypeScript.isPropertyAssignment);
      if (
        properties.some((property) => ["subactions", "items"].includes(property.name.getText(file)))
      ) {
        const title = properties.find((property) => property.name.getText(file) === "title");
        if (title) add(node, "submenu", title.initializer);
      }
    }
    TypeScript.forEachChild(node, visit);
  };
  visit(file);
  return sites;
}
