export { name, Config, apply, inject, TraceStore, expandHome } from './plugin.ts';
export type { Config as ToolTraceConfig } from './plugin.ts';
export { aggregate, renderStats, type TraceRecord, type ToolStat, type TraceAggregate } from './stats.ts';
export { parseRecordLine, type TraceLineLike } from './trace-line.ts';
