import { join } from "node:path";

async function files(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = join(directory, entry.name);
    paths.push(...(entry.isDirectory ? await files(path) : [path]));
  }
  return paths.sort();
}

async function bundle(args: string[]) {
  const { success } = await new Deno.Command("deno", {
    args: ["bundle", "--platform=browser", "--no-npm", "--no-remote", ...args],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!success) throw new Error("Deno bundle failed");
}

async function clean(path: string) {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  await Deno.mkdir(path, { recursive: true });
}

export async function buildLibrary() {
  const { default: ts } = await import("typescript");
  await clean("dist");
  const sources = (await files("src")).filter((path) => path.endsWith(".ts"));
  await bundle(["--inline-imports=false", "--outdir=dist/esm", ...sources]);
  await bundle([
    "--inline-imports=false",
    "--format=cjs",
    "--outdir=dist/cjs",
    ...sources,
  ]);
  // Keep declarations as a shared module tree. Rolling up each entry separately
  // duplicates private class identities and breaks cross-subpath consumers.
  const program = ts.createProgram(sources, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    declaration: true,
    emitDeclarationOnly: true,
    allowImportingTsExtensions: true,
    noEmitOnError: true,
    rootDir: "src",
    outDir: "dist/types",
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  });
  const emit = program.emit();
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...emit.diagnostics,
  ];
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: Deno.cwd,
      getNewLine: () => "\n",
    }));
  }
  for (const directory of ["dist/esm", "dist/cjs", "dist/types"]) {
    for (const path of await files(directory)) {
      const declaration = path.endsWith(".d.ts");
      const commonjs = directory.endsWith("cjs");
      const source = (await Deno.readTextFile(path)).replace(
        /(["'])(\.[^"']+)\.ts\1/g,
        `$1$2.${commonjs ? "cjs" : "js"}$1`,
      );
      if (declaration) {
        const target = path;
        await Deno.writeTextFile(target, source);
        await Deno.writeTextFile(
          target.replace(/\.d\.ts$/, ".d.cts"),
          source.replace(/(["'])(\.[^"']+)\.js\1/g, "$1$2.cjs$1"),
        );
      } else {
        const target = commonjs ? path.replace(/\.js$/, ".cjs") : path;
        await Deno.writeTextFile(target, source);
        if (target !== path) await Deno.remove(path);
      }
    }
  }
  for (
    const [name, entry] of Object.entries({
      nodeflow: "index",
      core: "core/index",
      runtime: "runtime/index",
      layout: "layout/index",
    })
  ) {
    await Deno.writeTextFile(
      `dist/${name}.js`,
      `export * from './esm/${entry}.js';\n`,
    );
    await Deno.writeTextFile(
      `dist/${name}.cjs`,
      `module.exports = require('./cjs/${entry}.cjs');\n`,
    );
  }
  // The public worker is a single portable module asset.
  await bundle(["--output=dist/layout-worker.js", "src/layout/worker.ts"]);
}

export async function buildExamples(browserTests = false) {
  await clean("dist-demo");
  const output = "dist-demo/examples/workbench";
  await Deno.mkdir(output, { recursive: true });
  await bundle([`--output=${output}/main.js`, "examples/workbench/main.ts"]);
  await bundle([`--output=${output}/layout-worker.js`, "src/layout/worker.ts"]);
  await Deno.copyFile("examples/workbench/style.css", `${output}/style.css`);
  await Deno.writeTextFile(
    `${output}/index.html`,
    (await Deno.readTextFile("examples/workbench/index.html")).replace(
      'src="./main.ts"',
      'src="./main.js"',
    ),
  );
  if (browserTests) {
    await bundle([
      "--output=dist-demo/tests/browser/fixture.js",
      "tests/browser/fixture.ts",
    ]);
    await Deno.copyFile(
      "tests/browser/fixture.html",
      "dist-demo/tests/browser/fixture.html",
    );
  }
}

if (import.meta.main) {
  if (Deno.args[0] === "examples" || Deno.args[0] === "browser") {
    await buildExamples(Deno.args[0] === "browser");
  } else await buildLibrary();
}
