import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HostProcess from "@t3tools/shared/hostProcess";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveJavaHome } from "./mobile-native-client.ts";

/** A JDK has a compiler beside its runtime; a JRE has only the runtime. */
const makeJvm = Effect.fn(function* (root: string, name: string, withCompiler: boolean) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = path.join(root, name);
  yield* fs.makeDirectory(path.join(home, "bin"), { recursive: true });
  // PATH lookup only considers executables, so the mode bits matter here.
  for (const tool of withCompiler ? ["java", "javac"] : ["java"]) {
    const binary = path.join(home, "bin", tool);
    yield* fs.writeFileString(binary, "");
    yield* fs.chmod(binary, 0o755);
  }
  return home;
});

const resolve = (environment: Record<string, string>) =>
  resolveJavaHome().pipe(
    Effect.provideService(HostProcess.HostProcessPlatform, "linux"),
    Effect.provideService(HostProcess.HostProcessEnvironment, environment),
  );

it.layer(NodeServices.layer)("android jdk resolution", (it) => {
  it.effect("keeps a JAVA_HOME that can compile", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "jdk-" });
      const jdk = yield* makeJvm(root, "jdk-17", true);

      assert.equal(yield* resolve({ JAVA_HOME: jdk, PATH: "" }), jdk);
    }),
  );

  it.effect("falls back to the JDK owning javac when JAVA_HOME is a JRE", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "jdk-" });
      const jre = yield* makeJvm(root, "jre-25", false);
      const jdk = yield* makeJvm(root, "jdk-17", true);

      // The exact shape that broke the 1.2.0 build: `java` resolves to a
      // headless runtime while `javac` comes from a different install.
      const resolved = yield* resolve({
        JAVA_HOME: jre,
        PATH: [path.join(jre, "bin"), path.join(jdk, "bin")].join(":"),
      });

      assert.equal(resolved, jdk);
    }),
  );

  it.effect("names the offending JAVA_HOME when nothing can compile", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "jdk-" });
      const jre = yield* makeJvm(root, "jre-25", false);

      const error = yield* resolve({ JAVA_HOME: jre, PATH: "" }).pipe(Effect.flip);

      assert.equal(error._tag, "NativeClientError");
      assert.include(error.message, jre);
      assert.include(error.message, "not a JRE");
    }),
  );
});
