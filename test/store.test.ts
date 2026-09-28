import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TraceStore } from '../src/plugin.ts';
import { aggregate } from '../src/stats.ts';
import type { TraceRecord } from '../src/stats.ts';

const record: TraceRecord = { v: 1, sessionId: 's1', at: '2026-09-28T01:00:00.000Z', tool: 'bash', durationMs: 100, argChars: 10, resultChars: 20, isError: false };

test('appends split by month; torn lines are skipped and counted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tool-trace-'));
  const store = new TraceStore(dir);
  store.append(record as TraceRecord);
  store.append({ ...record, at: '2026-10-02T00:00:00.000Z' });
  const sep = join(dir, 'tool-trace-2026-09.jsonl');
  writeFileSync(sep, readFileSync(sep, 'utf8') + 'torn\n');
  const all = store.readAll();
  assert.equal(all.records.length, 2);
  assert.equal(all.skipped, 1);
  assert.equal(aggregate(all.records).calls, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('missing dir reads empty; impossible months ignored; ~ expands', () => {
  const store = new TraceStore(undefined);
  assert.ok(!store.dataDir.startsWith('~'));
  const missing = new TraceStore(join(tmpdir(), `tool-trace-none-${Date.now()}`));
  assert.deepEqual(missing.readAll(), { records: [], skipped: 0 });
  const dir = mkdtempSync(join(tmpdir(), 'tool-trace-'));
  const store2 = new TraceStore(dir);
  store2.append(record as TraceRecord);
  writeFileSync(join(dir, 'tool-trace-2026-13.jsonl'), 'x\n');
  assert.equal(store2.readAll().records.length, 1);
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(join(tmpdir(), 'tool-trace-none-0')));
});
