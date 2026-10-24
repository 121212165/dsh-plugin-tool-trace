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
    turn?: number | undefined;
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
    tools: ToolStat[];
    calls: number;
    totalMs: number;
    skippedLines: number;
}
export declare function aggregate(records: TraceRecord[], skippedLines?: number): TraceAggregate;
export declare function renderStats(aggregate: TraceAggregate, limit?: number): string;
//# sourceMappingURL=stats.d.ts.map