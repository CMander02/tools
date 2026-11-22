# Tampermonkey 脚本

本目录存放浏览器端运行的 Tampermonkey 脚本。

## 脚本清单

| 名称 | 文件 | 适用站点 | 功能说明 |
| --- | --- | --- | --- |
| 聚合媒体下载 | [media-downloader.user.js](media-downloader.user.js) | X、B 站动态、小红书笔记、Pixiv | 下载原尺寸图片、视频、动图、实况照片和 Pixiv 小说，支持分站子目录、命名模板、图片 XMP 元数据写入与分享链接清理 |

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
- 在 B 站跨域嵌入页面使用本地文件夹时，下载按钮会在新标签页打开动态详情。若已允许访问详情页记住的文件夹，脚本会自动继续下载。若需要选择目录或授权，请点击详情页的下载按钮。Chrome 下载目录模式可以直接在嵌入页面下载。
- 下载范围按图片、视频、动图和实况照片分组，并显示常见格式。原尺寸和图片元数据位于图片设置中。脚本保留平台提供的实际格式，不转换文件。视频画质及视频 JSON 设置也适用于动图或实况片段。
- 每个平台单独保存设置。B 站下载动态和图文中的图片。小红书的 `all` 按钮下载整篇笔记，实况照片的静态部分与动态部分分别由图片、实况照片设置控制。
- B 站和 X 的默认文件名都包含日期、作者、帖子 ID、媒体类型和同类型序号及总数。B 站使用作者显示名，X 使用用户名。等于旧版 B 站默认值的模板会自动使用新版默认值。

## Pixiv

- 打开作品或小说详情页，点击右下角的下载按钮。Pixiv 默认直接写入本地文件夹。首次下载时选择用于保存 Pixiv 内容的文件夹，例如 `Downloads/Chrome/Pixiv`。脚本会记住所选文件夹，右键下载按钮可重新选择。
- 插画和漫画按页下载。默认文件名沿用 X 的结构，包含日期、作者显示名、作品 ID、媒体类型、序号和总数。可在命名模板中添加 `%medianame%` 或 `%postname%` 来使用 Pixiv 原文件名或作品标题。动图保存为帧 ZIP 和 JSON 文件，JSON 中的 `frames` 记录每帧文件名和时长，单位为毫秒。
- 图片默认写入 Pixiv 标题、作者、标签、说明、发布日期和来源链接。脚本将这些字段写入独立的 XMP 命名空间。已有标准 XMP 字段时保留原值，缺少标准字段时填入对应 Pixiv 值。PNG 的作者文本块、EXIF 和图像数据均保留。遇到无法合并的 XMP 时，脚本保存原图和同名 JSON。
- 小说默认保存为 EPUB，可在设置中切换为 UTF-8 TXT。EPUB 内含封面、正文插图和书籍元数据。TXT 在同一目录保存图片，并在正文中标注文件名。图片按所选元数据模式保存小说的标题、作者、标签和来源链接。
- 可在设置中改用 Chrome 下载目录，默认的相对子文件夹是 `Pixiv`。选择此方式时，在 Tampermonkey 管理面板的「设置 → 下载 BETA → 文件扩展名白名单」中添加 `.epub`。若 IDM 等扩展使 Chrome 忽略配置的子文件夹和文件名，请改用「手动选择本地文件夹」。

## 验证

运行 `node --test tampermonkey/media-downloader.test.cjs`，检查下载路径、两种下载方式、文件夹恢复、Pixiv 多图下载及小说导出。Chrome 中还需实测 Tampermonkey 下载权限、平台媒体读取和文件保存。
