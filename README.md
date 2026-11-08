# 网影猎手 NetShadow Hunter

![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4)
![Electron](https://img.shields.io/badge/Electron-44-47848F)
![Vue](https://img.shields.io/badge/Vue-3-42B883)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6)
![License](https://img.shields.io/badge/license-MIT-green)

**把「浏览 → 选格式 → 下载 → 管理队列」收进同一个窗口的开源桌面客户端。**

网影猎手不是站点解析器，而是 [yt-dlp](https://github.com/yt-dlp/yt-dlp) 的桌面 GUI：左侧内嵌浏览器用来找内容，右侧下载队列负责解析格式、选择清晰度、下载、暂停/继续和打开文件。需要合并音视频或转码时，调用本机 **ffmpeg / ffprobe**。

- GitHub：<https://github.com/Andr3Wang/NetShadowHunter>
- Gitee：<https://gitee.com/Andr3w/NetShadowHunter>
- 详细方案 / 技术路线 / 软件架构：[docs/网影猎手-总体方案.md](docs/网影猎手-总体方案.md)

---

## 功能特性

- **内嵌浏览器**：左侧直接打开 Bilibili、抖音、YouTube、小红书等页面，支持地址栏、后退、前进、刷新、主页。
- **一键解析**：点「下载此页」后调用 `yt-dlp -J` 读取页面可用格式。
- **清晰度选择**：推荐 4K / 2K / 1080p / 720p / 480p，也支持高级手动格式和仅音频。
- **片源最高**：默认按源站可用最高清晰度选档，减少每次选择成本。
- **下载队列**：显示进度、速度、ETA、文件大小、状态和错误信息。
- **任务控制**：暂停、继续、取消、重试、打开文件、打开所在文件夹。
- **网页下载接管**：页面自身触发的下载也会进入队列。
- **浏览器下载控制**：网页原生下载支持真正的 `DownloadItem.pause()/resume()`。
- **历史记录**：完成/失败/取消的任务保留在「最近」页，最多 100 条。
- **便携分发**：生成 `win-unpacked` 目录和 `portable.zip`，解压即用。
- **Windows 友好**：处理中文路径、GBK 输出、非法文件名和重名文件。
- **失败校验**：yt-dlp 退出码为 0 后仍会检查输出文件是否存在、是否 0 字节。

---

## 界面布局

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ 品牌 │ ← → ↻ ⌂ │ 地址栏 │ [下载此页] ⚙ │ ─ □ × │
├────────────────────────────────────────────┬─────────────────────────────┤
│                                            │ 下载队列 / 最近             │
│         内嵌浏览器                          │                             │
│         (WebContentsView)                  │ 任务卡 / 格式选择面板        │
│                                            │                             │
│                                            │─────────────────────────────│
│                                            │ 快捷访问                    │
│                                            │ Bilibili 抖音 YouTube 小红书│
│                                            │ 打开下载文件夹 / 引擎状态    │
└────────────────────────────────────────────┴─────────────────────────────┘
```

设置页目前只包含：

- 默认保存目录
- 同时下载数（1–5）
- 关于与合规提示

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面运行时 | Electron 44 |
| 前端框架 | Vue 3 + Composition API |
| 构建 | electron-vite + Vite |
| 语言 | TypeScript 5.9（strict） |
| 打包 | electron-builder（Windows `dir` target） |
| 解析/下载 | yt-dlp |
| 合并/转码 | ffmpeg / ffprobe |
| 状态 | Vue `reactive` + 主进程内存状态 + JSON 持久化 |
| 测试 | tsx + Node test runner |

---

## 快速开始

### 环境要求

- Node.js **22 或更新版本**
- Windows 10/11 x64（主要目标）
- 可用的 `yt-dlp.exe`
- 合并高清视频或转码时需要 `ffmpeg.exe` / `ffprobe.exe`

### 安装依赖

```bash
npm install
```

### 准备引擎二进制

仓库**不提交** `resources/bin/*.exe`，因为 ffmpeg/ffprobe 单文件超过 GitHub 普通文件限制。开发或打包前请自行放置：

```text
resources/bin/
  yt-dlp.exe
  ffmpeg.exe
  ffprobe.exe
```

也可以把这些程序放到系统 `PATH`。便携 zip 会包含二进制，但源码仓库不包含。

### 启动开发窗口

```bash
npm run dev
```

开发渲染服务默认在 `http://127.0.0.1:44732`。用普通浏览器打开只能看到壳，内嵌浏览器和真实下载需要在 Electron 桌面窗口中运行。

### 测试与类型检查

```bash
npm test
npm run typecheck
```

---

## 使用流程

1. 在地址栏输入网址，或点击侧栏快捷入口。
2. 打开具体的视频/音频页面。
3. 点击顶部「下载此页」。
4. 等待 yt-dlp 解析可用格式。
5. 在格式面板选择清晰度、仅音频或高级格式。
6. 可临时更换本次保存目录，或设为默认。
7. 点击「开始下载」。
8. 在右侧队列查看进度、速度、ETA。
9. 完成后打开文件或所在文件夹。

### 格式选择说明

- **推荐档位**：只显示不超过源站最高高度的档位。
- **source-max**：默认选择推荐档位中的最高项。
- **视频编码偏好**：优先 H.264 + AAC + MP4，兼容 Windows 播放器。
- **仅音频**：MP3 / M4A / 原音质。
- **高级格式**：手动选择 yt-dlp 返回的具体 format id；视频轨可自动合并音轨。

---

## 构建与打包

### 生产编译

```bash
npm run build
```

输出：

```text
out/
  main/index.js
  preload/index.js
  renderer/
```

### 便携目录

```bash
npm run package:dir
```

输出：

```text
dist/win-unpacked/
  netshadow-hunter.exe
  resources/
    app.asar
    home.html
    bin/
      yt-dlp.exe
      ffmpeg.exe
      ffprobe.exe
```

### 便携 zip

```bash
npm run package:portable
```

脚本会依次执行：

1. `npm run build`
2. `electron-builder --win dir`
3. `Compress-Archive` 生成 `dist/网影猎手-<version>-portable.zip`

产物：

```text
dist/网影猎手-0.1.0-portable.zip
```

---

## 项目结构

```text
NetShadowHunter/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 窗口、生命周期、服务装配
│   │   ├── ipc.ts            # IPC 路由
│   │   ├── browser.ts        # WebContentsView 内嵌浏览器
│   │   ├── downloads.ts      # 下载队列、进程、进度、历史
│   │   ├── binaries.ts       # yt-dlp / ffmpeg 检测与安装
│   │   ├── settings.ts       # 设置读写
│   │   └── cookies.ts        # Cookie jar 工具（当前下载路径未启用）
│   ├── preload/              # contextBridge 白名单 API
│   ├── renderer/             # Vue 3 界面
│   │   └── src/
│   │       ├── App.vue
│   │       ├── store.ts
│   │       ├── components/
│   │       └── styles/app.css
│   └── shared/               # 主进程/渲染进程共享
│       ├── types.ts
│       └── ytdlp.ts          # 参数组装、进度解析、格式映射、选档
├── resources/
│   ├── home.html             # 起始页
│   ├── icon.png
│   └── bin/                  # 本地引擎二进制（不提交）
├── scripts/
│   └── package-portable.ps1  # 构建 + 打 zip
├── tests/                    # 不启动 Electron 的单元测试
├── docs/                     # 合并后的总体方案文档
├── electron-builder.yml
├── electron.vite.config.ts
└── package.json
```

---

## 数据与配置

应用使用 Electron `userData` 目录保存本地数据：

| 文件 | 内容 |
|------|------|
| `settings.json` | 默认目录、并发数等设置 |
| `queue.json` | 当前任务队列 |
| `history.json` | 最近完成/失败/取消记录 |

默认输出模板：

```text
%(title)s [%(id)s].%(ext)s
```

---

## 安全与合规

- 渲染进程不直接使用 Node，统一通过 preload 白名单 IPC。
- 内嵌浏览器启用 `sandbox`、`contextIsolation`，关闭 `nodeIntegration`。
- yt-dlp 使用 `shell: false` 启动，不拼接 shell 字符串。
- format id、代理协议、URL 都做基本校验。
- 下载文件名会清理 Windows 非法字符，并自动处理重名。
- 应用不绕过 DRM、付费墙或验证码。
- 请只下载你有权保存的内容，并遵守目标网站服务条款与所在地版权法。

当前版本默认**不把内置浏览器的 Cookie 交给 yt-dlp**。后续若启用，只会写成本机临时 Cookie 文件，并在任务结束后删除。

---

## 当前限制

- **DRM 内容不支持**：受 Widevine / PlayReady / ChinaDRM 等保护的内容无法下载。
- **Cookie 跟随未启用**：需要登录的站点可能解析失败。
- **源码仓库不含引擎二进制**：需要自行放置或使用便携包。
- **Windows 优先**：macOS/Linux 配置保留，但当前主交付是 Windows。
- **无代码签名**：Windows 可能显示 SmartScreen 提示。
- **无 E2E 测试**：目前以 shared 层单元测试 + 手工冒烟为主。

---

## 路线图

- [ ] 修复 `userData/bin` 引擎检测闭环
- [ ] 增加主窗口外链协议白名单
- [ ] 评估主窗口 `sandbox: true`
- [ ] 增加 DRM 错误映射和明确提示
- [ ] 在合规前提下恢复临时 Cookie 跟随
- [ ] 增加 Electron E2E 测试
- [ ] 配置代码签名与自动更新
- [ ] 优化安装包体积和语言包

---

## 贡献

欢迎提交 Issue 和 Pull Request。

提交前建议先运行：

```bash
npm test
npm run typecheck
npm run build
```

如果改动涉及下载流程，请至少手工验证：

- 打开一个公开视频页
- 解析格式
- 下载视频
- 下载音频
- 暂停 / 继续 / 取消
- 中文文件名
- 0 字节输出判定
- 解压 portable zip 后启动

---

## License

[MIT](LICENSE)

---

## English

**NetShadow Hunter** is an open-source desktop client for Windows that combines an embedded browser, yt-dlp format probing, and a download queue in one window.

It is a GUI over yt-dlp, not a reimplementation of site extractors. It does not bypass DRM, paywalls, or access controls; only download content you are allowed to keep.

```bash
npm install
npm run dev
npm test
npm run package:portable
```

See the consolidated design document: [docs/网影猎手-总体方案.md](docs/网影猎手-总体方案.md).