# 网影猎手 NetShadow Hunter

开源的「浏览 → 挑选 → 下载」桌面客户端。左侧是内嵌浏览器，右侧是下载队列。点「下载此页」后，由 [yt-dlp](https://github.com/yt-dlp/yt-dlp) 列出格式并下载。需要合并音视频或转成 MP3 / M4A 时，再调用本机的 ffmpeg。

本项目是 yt-dlp 的图形界面，**不自行实现网站解析**。

详细方案、技术路线与软件架构见：[docs/网影猎手-总体方案.md](docs/网影猎手-总体方案.md)。

## 免责声明

请只下载你有权保存的内容，并遵守目标网站的服务条款与所在地的版权法。网影猎手不绕过付费墙，也不提供账号、Cookie 或视频的分享功能。当前版本默认不把内置浏览器的 Cookie 交给下载引擎；后续若启用，只会写成本机临时 Cookie 文件并在用完后删除。

## 环境

- Node.js 22 或更新版本
- Windows 10/11 是主要目标；开发也可以在 macOS / Linux 上进行
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) 在 `PATH` 上，或在应用里点「下载 yt-dlp」（从 GitHub releases 的 latest 拉官方可执行文件，放到用户数据目录）
- [ffmpeg](https://ffmpeg.org/) / ffprobe：优先使用 `resources/bin` 内置文件，也支持 PATH。当前设置页不提供路径填写。没有 ffmpeg 时，单文件下载通常仍可用；合并画质和 MP3 / M4A 会失败

Windows 安装 ffmpeg 的一种方式：

```powershell
winget install Gyan.FFmpeg
```

## 引擎二进制

仓库不提交 `resources/bin/*.exe`，因为 ffmpeg/ffprobe 单文件超过 GitHub 的普通文件限制。开发或打包前请自行放置：

```text
resources/bin/
  yt-dlp.exe
  ffmpeg.exe
  ffprobe.exe
```

也可以把 yt-dlp / ffmpeg 放到系统 `PATH`。便携 zip 中会包含这些二进制，但源码仓库不包含。

## 开发

```bash
npm install
npm run dev
```

`npm run dev` 会打开 Electron 窗口：左边浏览器，右边下载队列。渲染进程开发服务器在 `http://127.0.0.1:44731`。用普通浏览器打开这个地址只能看界面，内嵌网页和下载需要桌面窗口。

部分 Linux 环境需要关掉 Chromium 沙箱才能启动 Electron：

```bash
npm run dev -- --noSandbox
```

## 测试与类型检查

```bash
npm test
npm run typecheck
```

## 打包 Windows

在 Windows 上（或已配置好跨平台打包的环境）：

```bash
npm run package
```

等价脚本：`npm run package:win`。安装包输出在 `dist/`，文件名类似 `netshadow-hunter-0.1.0-setup.exe`。`npm run build` 只做类型检查和编译，不打安装包。`npm run package:dir` 生成免安装目录。

## 怎么用

1. 在地址栏打开页面，或用右侧的 Bilibili、YouTube、SoundCloud、Bandcamp。
2. 点「下载此页」。应用用 yt-dlp `-J` 读取格式。
3. 选择画质、页面提供的具体格式，或只要 MP3 / M4A。可以改这一次的保存目录。
4. 队列里看进度、速度和剩余时间。暂停会结束当前进程，继续时带 `--continue` 接着下。取消会停掉任务。完成后可以打开文件或所在文件夹。
5. 网页自己触发的下载也会进队列，这种任务可以真正暂停和继续。

设置里可以改默认目录、文件名模板、默认格式、同时下载数、代理、yt-dlp / ffmpeg 路径，以及是否把当前页面的登录状态交给 yt-dlp。格式面板可以预览完整命令；Cookie 文件路径不会出现在预览里。

建议用短的公开页面做第一次试跑，确认 yt-dlp 和 ffmpeg 都已被页脚识别。页脚会显示检测到的版本。

## 目录

```
src/main/        Electron 主进程：窗口、内嵌浏览器、yt-dlp 队列、设置
src/preload/     预加载脚本，只暴露有限的 IPC
src/renderer/    Vue 3 界面
src/shared/      主进程和界面共用的类型、参数组装、进度解析
resources/       图标和浏览器起始页
tests/           不启动 Electron 的单元测试
```

## English

NetShadow Hunter (网影猎手) is an open-source desktop client: browse in an embedded view, pick a format, and download with yt-dlp. It is a UI over yt-dlp plus ffmpeg, not a reimplementation of site extractors.

```bash
npm install
npm run dev          # Electron window
npm test
npm run package      # Windows installer via electron-builder
```

Put yt-dlp and ffmpeg on `PATH`, set their paths in Settings, or use **下载 yt-dlp** to fetch the official yt-dlp binary on first run. Respect site terms and copyright; only download what you are allowed to keep. Login cookies from the embedded browser stay on the local machine for that yt-dlp process and are deleted afterwards.

License: MIT.
