# 仓库维护说明

## 目录

- `plugins/general/` 收录跨项目和跨领域复用的 skills。`plain-rigorous-writing` 在这里。
- `plugins/ai-tools/` 收录调用其他 AI 工具和组织多工具协作的 skills。
- `plugins/web/` 收录网页内容提取和媒体下载的 skills。配套程序位于 `plugins/web/tools/`。
- `setup-service/` 提供 Python、Bash 和 PowerShell 安装入口。三个入口均从当前检出安装一个指定插件。
- `.agents/plugins/marketplace.json` 登记 Codex 可安装的插件。市场名为 `cmander-skills`。

## 修改约定

- 将 skill 放在 `plugins/<plugin>/skills/<skill-name>/SKILL.md`。YAML 中的 `name` 与目录名一致。`description` 说明用途和适用场景。
- 将 skill 专用的参考文档放在对应 skill 的 `references/`。引用配套文件时，使用相对于 skill 目录或插件目录的路径。检查插件安装后的副本能找到这些文件。
- 新增或移动插件时，同步核对插件的 `plugin.json`、marketplace 条目和 README。新增或移动 skill 时，更新 README 的插件清单。
- 修改安装流程时，三个入口应接受相同的插件名，并在 Codex 命令失败时返回非零退出码。
- 将凭据、浏览器会话、个人路径、依赖目录和构建产物留在本机。

## 验证

- 提交前运行 `git diff --check`。核对新增文件、相对链接和目录移动后的引用。
- 修改插件清单后，用 Codex CLI 的 `plugin list` 核对插件名和来源路径。修改 skill 后，检查 YAML 头、目录名和配套文件路径。
- 修改安装脚本后，从含空格的检出路径检查三个入口。覆盖有效插件、未知插件和 Codex 命令失败三种情况。
- 修改网页工具后，在受影响的项目目录执行构建或 CLI 冒烟检查。需要外部账号或服务的操作按实际测试范围报告。
