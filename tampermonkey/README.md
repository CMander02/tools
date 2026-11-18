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
