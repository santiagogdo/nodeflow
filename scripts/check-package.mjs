import assert from "node:assert/strict";
import ts from "typescript";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const consumer = await mkdtemp(join(tmpdir(), "nodeflow-consumer-"));
function run(command, args, cwd = consumer) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: join(consumer, "npm-cache") },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
// The consumer's compiler is deliberately TypeScript, to validate the actual
// NodeNext ESM/CommonJS declarations used by npm applications.
function checkTypes(configPath) {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath),
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = [
    ...(config.error ? [config.error] : []),
    ...parsed.errors,
    ...ts.getPreEmitDiagnostics(program),
  ];
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => consumer,
      getNewLine: () => "\n",
    }),
  );
}
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
for (
  const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ]
) {
  assert.equal(
    Object.keys(manifest[field] ?? {}).length,
    0,
    `${field} must be empty`,
  );
}
async function checkImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await checkImports(path);
    else if (/\.[cm]?[jt]s$/.test(entry.name)) {
      const source = await readFile(path, "utf8");
      for (
        const match of source.matchAll(
          /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s*)['"]([^'"]+)['"]/g,
        )
      ) {
        assert.ok(
          match[1].startsWith("."),
          `External runtime import in ${path}: ${match[1]}`,
        );
      }
      assert.ok(
        !/https?:\/\/.*(?:\.js|\.css|fonts\.)/.test(source),
        `Remote runtime asset in ${path}`,
      );
    }
  }
}
// Traverse published runtime modules: type-only declarations must not pull visual code into the editor.
async function checkPresetIsolation(entry) {
  const seen = new Set();
  async function visit(path) {
    if (seen.has(path)) return;
    seen.add(path);
    const source = await readFile(path, "utf8");
    for (
      const match of source.matchAll(
        /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s*)['"]([^'"]+)['"]/g,
      )
    ) {
      if (!match[1].startsWith(".")) continue;
      const target = resolve(dirname(path), match[1]);
      assert.ok(
        !target.includes("/presets/"),
        `Visual preset leaked into ${entry}: ${target}`,
      );
      await visit(target);
    }
  }
  await visit(join(root, entry));
}
try {
  await checkImports(join(root, "src"));
  await checkImports(join(root, "dist"));
  await checkPresetIsolation("dist/esm/index.js");
  await checkPresetIsolation("dist/cjs/index.cjs");
  await checkPresetIsolation("dist/esm/presets/unstyled.js");
  const packResult = JSON.parse(
    run(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", consumer],
      root,
    ),
  );
  const packed = Array.isArray(packResult)
    ? packResult[0]
    : packResult.nodeflow;
  await writeFile(
    join(consumer, "package.json"),
    '{"type":"module","private":true}',
  );
  run("npm", [
    "install",
    "--offline",
    "--ignore-scripts",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    join(consumer, packed.filename),
  ]);
  const installed = (await readdir(join(consumer, "node_modules"))).filter(
    (name) => !name.startsWith("."),
  );
  assert.deepEqual(
    installed,
    ["nodeflow"],
    "The package must install without transitive dependencies",
  );
  await writeFile(
    join(consumer, "consumer.mjs"),
    `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { createPreset, Editor } from 'nodeflow';
    import { defaultPreset } from 'nodeflow/presets';
    import { unstyledPreset } from 'nodeflow/presets/unstyled';
    import { GraphDocument, NodeRegistry } from 'nodeflow/core';
    import { Runner } from 'nodeflow/runtime';
    import { layoutGraph } from 'nodeflow/layout';
    const require = createRequire(import.meta.url);
    assert.equal(typeof globalThis.document, 'undefined');
    const registry = new NodeRegistry().register({ type: 'value', title: 'Value', defaults: { value: 7 }, ports: [{ id: 'value', dataType: 'number', direction: 'output' }] });
    const document = new GraphDocument(registry); document.addNode({ id: 'a', type: 'value' });
    const runner = new Runner(registry).register('value', ({ data }) => ({ value: data.value }));
    assert.equal((await runner.run(document.snapshot()).result).status, 'completed');
    assert.equal(layoutGraph({ nodes: [{ id: 'a', width: 120, height: 100 }], edges: [] }).positions.a.x, 40);
    for (const [entry, member] of [['nodeflow', 'Editor'], ['nodeflow/core', 'GraphDocument'], ['nodeflow/runtime', 'Runner'], ['nodeflow/layout', 'layoutGraph']]) assert.equal(typeof require(entry)[member], 'function');
    assert.ok(require.resolve('nodeflow/layout-worker').endsWith('layout-worker.js'));
    assert.equal(typeof Editor, 'function');
    assert.equal(typeof defaultPreset.createPainter, 'function');
    assert.deepEqual(unstyledPreset.createPainter(), {});
    assert.equal(typeof require('nodeflow/presets').defaultPreset.createPainter, 'function');
    assert.equal(typeof require('nodeflow/presets/unstyled').unstyledPreset.createPainter, 'function');
    for (const makePreset of [createPreset, require('nodeflow').createPreset]) {
      const preset = makePreset(defaultPreset, { theme: { accent: 'teal' }, nodes: { style: { radius: 18 } } });
      assert.equal(preset.theme.accent, 'teal');
      assert.equal(preset.nodes.style.radius, 18);
      assert.equal(preset.nodes.style.headerHeight, defaultPreset.nodes.style.headerHeight);
      assert.equal(preset.createPainter, defaultPreset.createPainter);
    }
  `,
  );
  run("node", ["consumer.mjs"]);
  const types = `
    import { createPreset, Editor, type EditorPresetOverrides } from 'nodeflow';
    import { defaultPreset } from 'nodeflow/presets';
    import { unstyledPreset } from 'nodeflow/presets/unstyled';
    import { GraphDocument, NodeRegistry } from 'nodeflow/core';
    import { Runner } from 'nodeflow/runtime';
    import { layoutGraph, layoutWithWorker } from 'nodeflow/layout';
    const registry = new NodeRegistry().register({ type: 'value', title: 'Value', ports: [] });
    const graph = new GraphDocument(registry);
    const overrides: EditorPresetOverrides = {
      theme: { accent: '#67d9b0', portColors: { number: '#67d9b0' } },
      nodes: { style: { radius: 18 }, motion: { duration: 140 } },
      ports: { style: { radius: 6 } },
      connections: { style: { dash: [] } },
    };
    const forestPreset = createPreset(defaultPreset, overrides);
    const editor = new Editor(document.createElement('div'), { document: graph, preset: forestPreset });
    createPreset(forestPreset, { nodes: { draw(view, drawDefault) {
      const { context: ctx, geometry: { bounds: b }, style, theme } = view;
      ctx.fillStyle = theme.node;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.width, b.height, style.radius); ctx.fill();
      drawDefault(['header', 'body', 'ports', 'status']);
    } } });
    createPreset(unstyledPreset, { createPainter: () => ({
      node({ context, geometry }, part) {
        if (part === 'surface') context.fillRect(geometry.bounds.x, geometry.bounds.y, 10, 10);
      },
    }) });
    graph.addNode({ type: 'value' }); editor.fitView(); editor.destroy();
    new Runner(registry).register('value', () => ({})).run(graph.snapshot());
    layoutGraph({ nodes: [], edges: [] });
  `;
  await writeFile(join(consumer, "consumer.mts"), types);
  await writeFile(join(consumer, "consumer.cts"), types);
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        types: [],
      },
      files: ["consumer.mts", "consumer.cts"],
    }),
  );
  checkTypes(join(consumer, "tsconfig.json"));
  await writeFile(
    join(consumer, "headless.mts"),
    "import { GraphDocument, NodeRegistry } from 'nodeflow/core'; new GraphDocument(new NodeRegistry());",
  );
  await writeFile(
    join(consumer, "headless.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        lib: ["ES2022"],
        types: [],
      },
      files: ["headless.mts"],
    }),
  );
  checkTypes(join(consumer, "headless.json"));
  console.log(
    "Package checks passed: zero runtime dependencies, offline tarball install, ESM/CommonJS, public typings, preset isolation, DOM-free core, headless runner/layout, and worker export.",
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}
