/**
 * Wire-level (assembly layer) tests for tool-trace: mount the real apply()
 * against a scripted cordis context and drive tools/pre-execute and
 * tools/post-execute events end to end, including the jsonl store round-trip
 * and the corrupted-line degrade path. Template: dsh-plugin-quota/test/harness.ts.
 * @module test/wire
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

interface Listener { event: string; callback: (...args: unknown[]) => unknown }

interface CapturedCommand { name: string; handler: (...args: unknown[]) => unknown }

type Apply = (ctx: unknown, config: Record<string, unknown>) => void;

function cmdLogger() {
  return { info() {}, warn() {}, error() {} };
}

test('mount registers tools-stats, records a completed call, and the ranking shows it', async () => {
  const commands: CapturedCommand[] = [];
  const listeners: Listener[] = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'tool-trace-wire-'));
  after(() => rmSync(dataDir, { recursive: true, force: true }));
  const ctx = {
    logger: cmdLogger,
    on(event: string, callback: (...args: unknown[]) => unknown) { listeners.push({ event, callback }); },
    commands: { register(definition: CapturedCommand) { commands.push(definition); } },
  };
  const { apply } = (await import('../src/plugin.ts')) as unknown as { apply: Apply };
  await Promise.resolve(apply(ctx, { enabled: true, dataDir, captureArgsSize: true }));

  const stats = commands.find((candidate) => candidate.name === 'tools-stats');
  assert.ok(stats, 'tools-stats registered on mount');
  assert.equal(readdirSync(dataDir).length, 0, 'no jsonl before any call');

  const pre = listeners.find((candidate) => candidate.event === 'tools/pre-execute');
  const post = listeners.find((candidate) => candidate.event === 'tools/post-execute');
  assert.ok(pre && post, 'both middleware listeners registered');
  const exec = { rootCallId: 'c1', name: 'read_file', arguments: { q: 'query'.repeat(4) }, agent: { session: { id: 'sess-a' } } };
  pre.callback(exec, () => {});
  await post.callback(exec, { content: 'file body text', isError: false }, () => 'downstream');

  const files = readdirSync(dataDir);
  assert.equal(files.length, 1);
  const line = readFileSync(join(dataDir, files[0]!), 'utf8').trim().split(/\r?\n/)[0]!;
  assert.ok(line.includes('"tool":"read_file"'), `record line: ${line}`);

  const output = stats!.handler() as { kind: string; text: string };
  assert.ok(output.text.includes('read_file'), `ranking names the tool: ${output.text}`);
  assert.ok(output.text.includes('次工具调用'), `header present: ${output.text}`);
});

test('a mid-call crash leaves no record (start without completion is ignored)', async () => {
  const commands: CapturedCommand[] = [];
  const listeners: Listener[] = [];
  const ctx = {
    logger: cmdLogger,
    on(event: string, callback: (...args: unknown[]) => unknown) { listeners.push({ event, callback }); },
    commands: { register(definition: CapturedCommand) { commands.push(definition); } },
  };
  const { apply } = (await import('../src/plugin.ts')) as unknown as { apply: Apply };
  await Promise.resolve(apply(ctx, { enabled: true, dataDir: mkdtempSync(join(tmpdir(), 'tool-trace-wire-')), captureArgsSize: true }));
  const pre = listeners.find((candidate) => candidate.event === 'tools/pre-execute');
  assert.ok(pre);
  pre.callback({ rootCallId: 'c2', name: 'shell', agent: { session: { id: 's' } } }, () => {});
  const stats = commands.find((candidate) => candidate.name === 'tools-stats');
  const output = stats!.handler() as { text: string };
  assert.ok(output.text.includes('还没有工具调用记录'), `nothing recorded: ${output.text}`);
});

test('corrupt traced lines are skipped with a visible warning', async () => {
  const commands: CapturedCommand[] = [];
  const listeners: Listener[] = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'tool-trace-wire-'));
  after(() => rmSync(dataDir, { recursive: true, force: true }));
  const ctx = {
    logger: cmdLogger,
    on(event: string, callback: (...args: unknown[]) => unknown) { listeners.push({ event, callback }); },
    commands: { register(definition: CapturedCommand) { commands.push(definition); } },
  };
  const { apply } = (await import('../src/plugin.ts')) as unknown as { apply: Apply };
  await Promise.resolve(apply(ctx, { enabled: true, dataDir, captureArgsSize: false }));
  const pre = listeners.find((candidate) => candidate.event === 'tools/pre-execute')!;
  const post = listeners.find((candidate) => candidate.event === 'tools/post-execute')!;
  const exec = { rootCallId: 'c3', name: 'write_file', agent: { session: { id: 's' } } };
  pre.callback(exec, () => {});
  await post.callback(exec, { content: 'ok', isError: false }, () => 'downstream');

  const files = readdirSync(dataDir);
  assert.equal(files.length, 1);
  appendFileSync(join(dataDir, files[0]!), 'not-json\n', 'utf8');
  const stats = commands.find((candidate) => candidate.name === 'tools-stats');
  const output = stats!.handler() as { text: string };
  assert.ok(output.text.includes('1 行损坏被跳过'), `corrupt line surfaced: ${output.text}`);
});

test('disabled config mounts nothing', async () => {
  const ctx = {
    logger: cmdLogger,
    on(_event: string, _callback: never) { assert.fail('listener registered while disabled'); },
    commands: {
      register() { assert.fail('command registered while disabled'); },
    },
  };
  const { apply } = (await import('../src/plugin.ts')) as unknown as { apply: Apply };
  await Promise.resolve(apply(ctx, { enabled: false }));
});
