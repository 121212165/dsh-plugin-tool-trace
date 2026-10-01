# dsh-plugin-tool-trace

**EN** · Per-tool-call telemetry: duration plus argument and result sizes appended to monthly JSONL, with `/tools-stats` ranking the slowest tools. Keys off the same rootCallId/callId pairing that price-aware verified. · 6 `node --test` green · result size is exact when content is a string and a serialized estimate otherwise · not live-mounted.

DeepSeek Harness (dsh) 插件：工具调用追踪。每次工具调用记录耗时、参数量与结果量（**只记大小，不记内容**），按月 JSONL 落盘，`/tools-stats` 出慢工具排行榜。transcript 回答"说了什么"，本插件回答"做了什么、慢在哪"。

## 功能

- **`/tools-stats`**：按累计耗时排序，展示调用次数、累计/平均/最慢耗时、平均结果量、错误计数。
- **零模型可见面**：追踪只写文件不进上下文，是给人看的透视镜。
- **容错**：崩溃留下的半行跳过并计数；调用中途死掉只有开始没有结束，聚合自然忽略。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `dataDir` | `~/.dsh/tool-trace` | JSONL 目录 |
| `captureArgsSize` | `true` | 记录参数 JSON 长度 |

## 安装

三步，实测于 `@deepseek-ai/dsh@0.1.7-alpha.1`（需 `pnpm` 在 PATH 上）：

```sh
# ① 装进 profile：dsh plugin 把参数原样转发给 pnpm，git 包会自动跑 prepare 构建 lib/
dsh plugin --profile web add github:121212165/dsh-plugin-tool-trace
```

② 把本仓库根目录 `cordis.patch.yml` 的内容**并进** `$DSH_HOME/profiles/web/cordis.patch.yml`。
该文件默认是 `[]`，所以要么整份替换，要么把 insert 条目并进同一个数组；**不要直接追加**——
追加会形成两个 YAML 文档，启动即报
`failed to parse overlay ... end of the stream or a document separator is expected`（本机实测踩过）。

③ 重启 dsh。配置层与 client 半都要重启才生效（客户端按 boot 时算出的内容 rev 下发，硬刷新浏览器没用）。

自检挂载：`dsh --profile web --dump-config | grep dsh-plugin-tool-trace`，应看到该条目。
## 验证状态

- 聚合/渲染/存储为纯函数，6 个 node --test 全绿。
- `tools/pre-execute`/`tools/post-execute` 与 price-aware 已验证的调用键控（rootCallId/callId）一致。
- 结果体大小的提取依赖下游结果形状（content 为字符串时精确，其他形状序列化估计）；未在运行中的 dsh 里 live mount 验证本插件自身。
