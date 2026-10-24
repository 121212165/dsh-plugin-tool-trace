import Schema from '@deepseek-ai/schemastery';
import { mkdirSync, appendFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { aggregate, renderStats } from './stats.js';
import { parseRecordLine } from './trace-line.js';
export const name = 'tool-trace';
export const inject = ['commands', 'tools', 'sessions'];
export const Config = Schema.object({
    enabled: Schema.boolean().default(true),
    dataDir: Schema.string(),
    captureArgsSize: Schema.boolean().default(true),
});
export function expandHome(dir) {
    return dir.startsWith('~') ? join(homedir(), dir.slice(1)) : dir;
}
export class TraceStore {
    dataDir;
    constructor(dataDir) {
        this.dataDir = dataDir ? expandHome(dataDir) : join(homedir(), '.dsh', 'tool-trace');
    }
    fileFor(at) {
        return join(this.dataDir, `tool-trace-${at.slice(0, 7)}.jsonl`);
    }
    append(record) {
        mkdirSync(this.dataDir, { recursive: true });
        appendFileSync(this.fileFor(record.at), `${JSON.stringify(record)}\n`, 'utf8');
    }
    readAll() {
        const records = [];
        let skipped = 0;
        if (!existsSync(this.dataDir))
            return { records, skipped };
        for (const name of readdirSync(this.dataDir).filter(validName).sort()) {
            const result = parseRecordMulti(readFileSync(join(this.dataDir, name), 'utf8'));
            records.push(...result.records);
            skipped += result.skipped;
        }
        return { records, skipped };
    }
}
function validName(name) {
    const match = /^tool-trace-(\d{4})-(\d{2})\.jsonl$/.exec(name);
    if (!match)
        return false;
    const month = Number(match[2]);
    return month >= 1 && month <= 12;
}
function parseRecordMulti(content) {
    let skipped = 0;
    const records = [];
    for (const line of content.split(/\r?\n/)) {
        const record = parseRecordLine(line);
        if (record)
            records.push(record);
        else if (line.trim())
            skipped++;
    }
    return { records, skipped };
}
export function apply(ctx, config) {
    const log = ctx.logger('tool-trace');
    if (!config.enabled)
        return void log.info('disabled by config');
    const store = new TraceStore(config.dataDir);
    const inFlight = new Map();
    const callKeyOf = (exec) => {
        // Key per tool call, not per root call: calling on only rootCallId merges
        // parallel sibling tools under one key and their started times clobber each other.
        const shape = exec;
        const call = shape?.callId;
        if (call !== undefined && call !== null && String(call) !== '')
            return `${String(shape?.rootCallId ?? '')}:${String(call)}`;
        return String(shape?.rootCallId ?? call ?? '');
    };
    ctx.on('tools/pre-execute', (exec, next) => {
        const shape = exec;
        const key = callKeyOf(exec);
        if (key && typeof shape.name === 'string') {
            inFlight.set(key, {
                tool: shape.name,
                startedAt: Date.now(),
                argChars: config.captureArgsSize ? JSON.stringify(shape.arguments ?? {}).length : 0,
                turn: undefined,
            });
        }
        return next();
    });
    ctx.on('tools/post-execute', async (exec, result, next) => {
        const key = callKeyOf(exec);
        const flight = inFlight.get(key);
        inFlight.delete(key);
        const downstream = await next();
        if (!flight)
            return downstream;
        const resultShape = result;
        const resultText = resultShape?.content;
        const resultChars = typeof resultText === 'string' ? resultText.length : resultText === undefined ? 0 : JSON.stringify(resultText).length;
        const isError = Boolean(resultShape?.isError);
        try {
            store.append({
                v: 1,
                sessionId: String(exec?.agent?.session?.id ?? 'session'),
                at: new Date().toISOString(),
                tool: flight.tool,
                durationMs: Date.now() - flight.startedAt,
                argChars: flight.argChars,
                resultChars,
                isError,
                turn: flight.turn,
            });
        }
        catch (error) {
            log.warn(`trace append failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        return downstream;
    });
    ctx.commands.register({
        name: 'tools-stats',
        description: '工具调用追踪排行（原始统计）：谁最耗时、谁结果最大、谁在报错；带告警的合并视图在 error-radar 的 /health',
        handler: () => {
            const all = store.readAll();
            return {
                kind: 'success',
                text: `${renderStats(aggregate(all.records, all.skipped))}\n\n想看"现在能不能开工"：dsh-plugin-error-radar 的 /health（同一份追踪数据，加了错误率告警线与连败判定）。本命令继续只出原始统计，不重复挂 middleware。`,
            };
        },
    });
    log.info(`mounted · dataDir=${store.dataDir}`);
}
//# sourceMappingURL=plugin.js.map