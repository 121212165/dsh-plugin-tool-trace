import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregate, renderStats } from '../src/stats.ts';
import type { TraceRecord } from '../src/stats.ts';

const record = (over: Partial<TraceRecord>): TraceRecord =>
  ({ v: 1, sessionId: 's1', at: '2026-09-28T01:00:00.000Z', tool: 'bash', durationMs: 100, argChars: 50, resultChars: 2000, isError: false, ...over }) as TraceRecord;

test('per-tool aggregation ranks by total time and averages sizes', () => {
  const result = aggregate([record({}), record({ durationMs: 300 }), record({ tool: 'read', durationMs: 50, resultChars: 100 })]);
  assert.equal(result.calls, 3);
  assert.equal(result.tools[0]!.tool, 'bash'); // 400ms > 50ms
  assert.equal(result.tools[0]!.calls, 2);
  assert.equal(result.tools[0]!.avgMs, 200);
  assert.equal(result.tools[0]!.maxMs, 300);
  assert.equal(result.tools[0]!.avgResultChars, 2000);
  assert.equal(result.totalMs, 450);
});

test('errors are counted per tool', () => {
  const result = aggregate([record({}), record({ isError: true })]);
  assert.equal(result.tools[0]!.errors, 1);
});

test('malformed numeric fields are dropped from aggregation, not thrown on', () => {
  const result = aggregate([record({}), record({ durationMs: Number.NaN }), record({ durationMs: -5 })]);
  assert.equal(result.calls, 3); // aggregate counts what it was given
  assert.equal(result.tools[0]!.calls, 1);
});

test('rendering ranks, shows seconds for big totals and flags corruption', () => {
  const text = renderStats(aggregate([record({ durationMs: 15_000 }), record({ durationMs: 200 })], 2));
  assert.ok(text.includes('bash'));
  assert.ok(text.includes('15.2s'));
  assert.ok(text.includes('2 行损坏'));
  assert.ok(renderStats(aggregate([])).includes('还没有'));
});
