/**
 * dsh wiring for tool-trace. tools/pre-execute opens a timing window keyed by
 * the call id (price-aware verified that the same keying works across the
 * waterfall); tools/post-execute closes it with the result size. Nothing model-
 * visible is added — the trace is for the human, not the agent.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type {} from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/dsh-tools';
import { mkdirSync, appendFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { aggregate, renderStats, type TraceRecord } from './stats.ts';
import { parseRecordLine, type TraceLineLike } from './trace-line.ts';

export const name = 'tool-trace';
export const inject = ['commands', 'tools', 'sessions'];

export interface Config {
  enabled: boolean;
  dataDir?: string;
  /** record argument JSON length (content is never persisted, only its size) */
  captureArgsSize: boolean;
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  dataDir: Schema.string(),
  captureArgsSize: Schema.boolean().default(true),
});

export function expandHome(dir: string): string {
  return dir.startsWith('~') ? join(homedir(), dir.slice(1)) : dir;
}

export class TraceStore {
  readonly dataDir: string;

  constructor(dataDir: string | undefined) {
    this.dataDir = dataDir ? expandHome(dataDir) : join(homedir(), '.dsh', 'tool-trace');
  }

  fileFor(at: string): string {
    return join(this.dataDir, `tool-trace-${at.slice(0, 7)}.jsonl`);
  }

  append(record: TraceRecord): void {
    mkdirSync(this.dataDir, { recursive: true });
    appendFileSync(this.fileFor(record.at), `${JSON.stringify(record)}\n`, 'utf8');
  }

  readAll(): { records: TraceRecord[]; skipped: number } {
    const records: TraceRecord[] = [];
    let skipped = 0;
    if (!existsSync(this.dataDir)) return { records, skipped };
    for (const name of readdirSync(this.dataDir).filter(validName).sort()) {
      const result = parseRecordMulti(readFileSync(join(this.dataDir, name), 'utf8'));
      records.push(...(result.records as unknown as TraceRecord[]));
      skipped += result.skipped;
    }
    return { records, skipped };
  }
}

function validName(name: string): boolean {
  const match = /^tool-trace-(\d{4})-(\d{2})\.jsonl$/.exec(name);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function parseRecordMulti(content: string): { records: TraceRecord[]; skipped: number } {
  let skipped = 0;
  const records: TraceRecord[] = [];
  for (const line of content.split(/\r?\n/)) {
    const record = parseRecordLine(line);
    if (record) records.push(record as unknown as TraceRecord);
    else if (line.trim()) skipped++;
  }
  return { records, skipped };
}

interface InFlight {
  tool: string;
  startedAt: number;
  argChars: number;
  turn?: number;
}

export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger('tool-trace');
  if (!config.enabled) return void log.info('disabled by config');
  const store = new TraceStore(config.dataDir);
  const inFlight = new Map<string, InFlight>();

  const callKeyOf = (exec: unknown): string => {
    const shape = exec as { rootCallId?: unknown; callId?: unknown };
    return String(shape?.rootCallId ?? shape?.callId ?? '');
  };

  ctx.on('tools/pre-execute', (exec, next) => {
    const shape = exec as { name?: unknown; arguments?: unknown; agent?: { session?: { id?: unknown } } };
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
    if (!flight) return downstream;
    const resultShape = result as { content?: unknown; isError?: unknown } | undefined;
    const resultText = resultShape?.content;
    const resultChars = typeof resultText === 'string' ? resultText.length : resultText === undefined ? 0 : JSON.stringify(resultText).length;
    const isError = Boolean(resultShape?.isError);
    try {
      store.append({
        v: 1,
        sessionId: String((exec as { agent?: { session?: { id?: unknown } } } | undefined)?.agent?.session?.id ?? 'session'),
        at: new Date().toISOString(),
        tool: flight.tool,
        durationMs: Date.now() - flight.startedAt,
        argChars: flight.argChars,
        resultChars,
        isError,
        turn: flight.turn,
      });
    } catch (error) {
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
