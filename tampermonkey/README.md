# Tampermonkey 脚本

本目录存放浏览器端运行的 Tampermonkey 脚本。

## 脚本清单

| 名称 | 文件 | 适用站点 | 功能说明 |
| --- | --- | --- | --- |
| 聚合媒体下载 | [media-downloader.user.js](media-downloader.user.js) | X、B 站动态、小红书笔记 | 下载原尺寸图片、视频、动图与实况照片，支持分站子目录、命名模板、图片 XMP 元数据写入与分享链接清理 |

## 目录约定

- 单文件脚本命名为 `tampermonkey/<script-name>.user.js`。
- 含配套资源或独立说明的脚本放在 `tampermonkey/<script-name>/` 子目录，入口文件命名为 `tampermonkey/<script-name>/<script-name>.user.js`。
- 每个 `.user.js` 文件头部的 `==UserScript==` 元信息块必须包含 `@name`、`@namespace`、`@version`、`@description`、`@match` 与 `@grant` 字段。
- 提交的 `.user.js` 文件不应包含个人账号凭据、Cookie 或私有接口密钥。浏览器端运行时配置可通过 `GM_getValue` 与 `GM_setValue` 在本地读写。

## 安装

1. 在浏览器中安装 Tampermonkey 扩展。
2. 打开 Tampermonkey 管理面板，在实用工具中导入本地 `.user.js` 文件，或在浏览器中访问对应 `.user.js` 文件的 GitHub Raw 链接以打开安装确认页。

## 聚合媒体下载设置

- 右键下载按钮可打开当前平台的设置。有效修改和恢复默认值都会自动保存。输入无效时，脚本会提示并保留上一次有效值。
- **Chrome 下载目录**：子文件夹模板相对于 Chrome 下载目录。例如 Chrome 下载目录是 `Downloads`，模板为 `Chrome/X`，文件保存到 `Downloads/Chrome/X`。可在 `chrome://settings/downloads` 核对 Chrome 下载目录。子文件夹需要 Tampermonkey 的浏览器 API 下载模式，设置中会显示当前模式。询问保存位置时，以保存对话框中的最终位置为准。
- **手动选择本地文件夹**。例如选择 `Downloads/Chrome/X`，文件直接保存到 `Downloads/Chrome/X`。浏览器会按站点记住所选文件夹。返回同一站点时，脚本会复用文件夹。Chrome 可能再次询问文件夹权限。没有已选文件夹时，点击下载会打开文件夹选择器。选定后，脚本继续本次下载。切换下载方式时会保留 Chrome 子文件夹模板。
- 下载范围按图片、视频、动图和实况照片分组，并显示常见格式。原尺寸和图片元数据位于图片设置中。脚本保留平台提供的实际格式，不转换文件。视频画质及视频 JSON 设置也适用于动图或实况片段。
- X、B 站、小红书的设置单独保存。B 站当前仅下载动态和图文中的图片。小红书的 `all` 按钮下载整篇笔记，实况照片的静态部分与动态部分分别由图片、实况照片设置控制。
- B 站和 X 的默认文件名都包含日期、作者、帖子 ID、媒体类型和同类型序号及总数。B 站使用作者显示名，X 使用用户名。等于旧版 B 站默认值的模板会自动使用新版默认值。

## 验证

运行 `node --test tampermonkey/media-downloader.test.cjs`，检查下载路径、两种下载方式和重新打开页面后的文件夹恢复。Chrome 中还需实测 Tampermonkey 下载权限、平台媒体读取和文件保存。
