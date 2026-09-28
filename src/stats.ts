import { sumMicros } from './money.ts';

/** Pure tool-call telemetry: aggregation over trace records for the /tools-stats
 * ranking. One JSONL record per completed tool call; crashes mid-call simply
 * leave a start without a completion and are ignored by aggregation. */

export interface TraceRecord {
  v: 1;
  sessionId: string;
  at: string;
  tool: string;
  durationMs: number;
  argChars: number;
  resultChars: number;
  isError: boolean;
  turn?: number;
}

export interface ToolStat {
  tool: string;
  calls: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
  avgArgChars: number;
  avgResultChars: number;
  errors: number;
}

export interface TraceAggregate {
  tools: ToolStat[]; // descending by totalMs
  calls: number;
  totalMs: number;
  skippedLines: number;
}

export function aggregate(records: TraceRecord[], skippedLines = 0): TraceAggregate {
  const byTool = new Map<string, ToolStat>();
  for (const record of records) {
    if (typeof record.tool !== 'string' || !Number.isFinite(record.durationMs) || record.durationMs < 0) continue;
    let stat = byTool.get(record.tool);
    if (!stat) {
      stat = { tool: record.tool, calls: 0, totalMs: 0, avgMs: 0, maxMs: 0, avgArgChars: 0, avgResultChars: 0, errors: 0 };
      byTool.set(record.tool, stat);
    }
    stat.calls++;
    stat.totalMs = sumMicros(stat.totalMs, Math.round(record.durationMs));
    stat.maxMs = Math.max(stat.maxMs, record.durationMs);
    stat.avgArgChars = (stat.avgArgChars * (stat.calls - 1) + Math.max(0, record.argChars ?? 0)) / stat.calls;
    stat.avgResultChars = (stat.avgResultChars * (stat.calls - 1) + Math.max(0, record.resultChars ?? 0)) / stat.calls;
    if (record.isError) stat.errors++;
  }
  const tools = [...byTool.values()];
  for (const stat of tools) stat.avgMs = stat.calls ? stat.totalMs / stat.calls : 0;
  tools.sort((a, b) => b.totalMs - a.totalMs);
  return { tools, calls: records.length, totalMs: sumMicros(...tools.map((tool) => tool.totalMs)), skippedLines };
}

export function renderStats(aggregate: TraceAggregate, limit = 12): string {
  if (!aggregate.calls) return '还没有工具调用记录。';
  const rows = aggregate.tools.slice(0, limit).map((tool) => {
    const seconds = tool.totalMs >= 10_000 ? `${(tool.totalMs / 1000).toFixed(1)}s` : `${Math.round(tool.totalMs)}ms`;
    return `  ${tool.tool.padEnd(24)} ${String(tool.calls).padStart(4)} 次 · 累计 ${seconds.padStart(8)} · 均 ${Math.round(tool.avgMs)}ms · 最慢 ${Math.round(tool.maxMs)}ms · 结果均 ${Math.round(tool.avgResultChars)} 字${tool.errors ? ` · ❌${tool.errors}` : ''}`;
  });
  const skipped = aggregate.skippedLines ? `\n⚠ ${aggregate.skippedLines} 行损坏被跳过` : '';
  return `${aggregate.calls} 次工具调用 · 总耗时 ${(aggregate.totalMs / 1000).toFixed(1)}s（按累计耗时排序）\n${rows.join('\n')}${skipped}`;
}
