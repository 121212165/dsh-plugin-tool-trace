# dsh-plugin-tool-trace

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

克隆或 npm 安装到 profile 的 node_modules；源码安装先 `npm install`（prepare 构建出 lib/）。

## 验证状态

- 聚合/渲染/存储为纯函数，6 个 node --test 全绿。
- `tools/pre-execute`/`tools/post-execute` 与 price-aware 已验证的调用键控（rootCallId/callId）一致。
- 结果体大小的提取依赖下游结果形状（content 为字符串时精确，其他形状序列化估计）；未在运行中的 dsh 里 live mount 验证本插件自身。
