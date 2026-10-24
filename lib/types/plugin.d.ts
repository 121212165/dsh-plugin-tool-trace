/**
 * dsh wiring for tool-trace. tools/pre-execute opens a timing window keyed by
 * the call id (price-aware verified that the same keying works across the
 * waterfall); tools/post-execute closes it with the result size. Nothing model-
 * visible is added — the trace is for the human, not the agent.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type TraceRecord } from './stats.ts';
export declare const name = "tool-trace";
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    dataDir?: string;
    /** record argument JSON length (content is never persisted, only its size) */
    captureArgsSize: boolean;
}
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    captureArgsSize: Schema<boolean, boolean>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    captureArgsSize: Schema<boolean, boolean>;
}>>;
export declare function expandHome(dir: string): string;
export declare class TraceStore {
    readonly dataDir: string;
    constructor(dataDir: string | undefined);
    fileFor(at: string): string;
    append(record: TraceRecord): void;
    readAll(): {
        records: TraceRecord[];
        skipped: number;
    };
}
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=plugin.d.ts.map