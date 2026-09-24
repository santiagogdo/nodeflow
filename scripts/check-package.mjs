import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Check the package's exported entry points from an external consumer directory.
const root = fileURLToPath(new URL('..', import.meta.url));
const consumer = await mkdtemp(join(tmpdir(), 'nodeflow-consumer-'));
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: consumer, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
try {
  await mkdir(join(consumer, 'node_modules'));
  await symlink(root, join(consumer, 'node_modules/nodeflow'), 'dir');
  await writeFile(join(consumer, 'package.json'), '{"type":"module"}');
  await writeFile(
    join(consumer, 'consumer.mjs'),
    `
    import assert from 'node:assert/strict';
    import { Editor, EventType, Node, Port, Connection } from 'nodeflow';
    import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    assert.equal(typeof Editor, 'function');
    assert.equal(typeof Node, 'function');
    assert.equal(typeof Port, 'function');
    assert.equal(typeof Connection, 'function');
    assert.equal(EventType.PORT_CONNECTED, 'PORT_CONNECTED');
    assert.equal(typeof require('nodeflow').Editor, 'function');
    assert.ok(require.resolve('nodeflow/style.css').endsWith('nodeflow.css'));
  `,
  );
  const types = `
    import { Editor, EventType } from 'nodeflow';
    import type { EditorConfig, EditorState, AddNodeParams, NodeStyle, ContextMenuItem } from 'nodeflow';
    const config: EditorConfig = { grid: { spacing: 20 } };
    const editor = new Editor(document.createElement('div'), config);
    const node: AddNodeParams = { style: { fill: '#fff' } };
    editor.addNode(node);
    const saved: EditorState = editor.toJSON();
    editor.deserialize(saved);
    editor.on(EventType.PORT_CONNECTED, event => event?.port.id);
    editor.destroy();
  `;
  await writeFile(join(consumer, 'consumer.mts'), types);
  await writeFile(join(consumer, 'consumer.cts'), types);
  run(['consumer.mjs']);
  run([
    resolve(root, 'node_modules/typescript/bin/tsc'),
    '--strict',
    '--noEmit',
    '--skipLibCheck',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--target',
    'ES2020',
    'consumer.mts',
    'consumer.cts',
  ]);
  console.log('Package checks passed: ESM, CommonJS, CSS export, and TypeScript consumers.');
} finally {
  await rm(consumer, { recursive: true, force: true });
}
