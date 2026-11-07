# 公开打包参考 / Public packaging references

更新时间：2026-11-07。

本仓库的公开结构根据以下已检索资料校对。链接保留在这里，方便后续维护者复核来源，而不是把第三方项目代码复制进来。

| 来源 | 采用部分 | 本仓库落点 |
|---|---|---|
| [OpenAI Codex skill-creator](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/skill-creator/SKILL.md) | 使用单一入口 Skill、渐进披露、按需读取 references、用验证器检查 frontmatter 和引用 | `SKILL.md`、`steps/`、`tests/Test-Workflow.ps1` |
| [OpenAI Cookbook docs-editor](https://github.com/openai/openai-cookbook/blob/main/.codex/skills/docs-editor/SKILL.md) | 发布前检查范围、事实、命令、链接和隐私边界，避免把编辑任务扩成无关重写 | `docs/RESEARCH.md`、公开发布清单 |
| [ever-just/agentskills](https://github.com/ever-just/agentskills) | 让每个能力有清晰的入口、边界和可复用说明，避免把一次性故事写成 Skill | `steps/*.md` 与根 `SKILL.md` |
| [hermann-ndamen/content-pipeline](https://github.com/hermann-ndamen/content-pipeline) | 参考“内容理解、平台文案、排期/发布分层”的产品边界；不复用其供应商或账号实现 | `references/content-workflow.md`、`references/publishing-workflow.md` |
| [GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning) | 公开仓库发布前保持凭据、Cookie、浏览器状态和日志在仓库外，并使用本地隐私扫描 | `SECURITY.md`、`.gitignore`、`scripts/Test-Privacy.ps1` |

## 本次采用的公开化决策

- 总入口保留一个 `SKILL.md`，具体步骤放在 `steps/` 和 `references/`，避免安装器把每个阶段注册成互相冲突的根 Skill。
- 每个步骤都声明输入、输出和停止条件，便于从中断状态恢复。
- 发布继续保留 `Prepare` 与 `Publish` 两道状态闸门；公开仓库只提供桥接和清单逻辑，不携带账号授权。
- 所有示例使用占位路径和虚构账号；原片、字幕、预测、数据、Cookie、浏览器资料和本地绝对路径不进入 Git。
