# Windows NVIDIA 导出实验

分支：`experiment/remotion-nvenc`，基于 `e60386a`。这是实验分支，不改变主分支发布策略。

## 改动范围

- Remotion、renderer、bundler、gif 同步固定为 `4.0.523`，更新关联锁文件。
- Windows/Linux H.264 硬件编码使用新版 Remotion 的 NVIDIA NVENC 路径（官方从 `4.0.484` 引入）。
- 补充 NVENC/CUDA/VideoToolbox 错误的软件重试识别；移除无效的 `chromiumOptions.hardwareAcceleration`。
- 硬件模式的质量档改用码率：1080p30 对应快速 6M、均衡 10M、高质量 16M，按像素数和帧率线性缩放，最低 2M。这是待验证的初始映射，不保证与软件 CRF 等画质。
- 保留 macOS 自动模式、软件 CRF/preset、透明格式和气泡动画实现。
- 新增使用真实 `PodchatRender` / 共享气泡组件的短视频测试，不读取用户项目、应用配置、音频或 biliup 凭据，也不会触发投稿。

## 环境检查

在已有开发仓库中先检查 `git status --short`，有未提交改动时不要强制切换或覆盖。推荐使用独立 worktree：

```powershell
git fetch origin
git worktree add -b experiment/remotion-nvenc ../PomChat-remotion-nvenc origin/experiment/remotion-nvenc
Set-Location ../PomChat-remotion-nvenc
node --version
npm --version
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
npm ci
npm run build
npm run test:biliup
```

上面的 worktree 命令适用于本机尚无该实验分支的情况。重复测试时进入已有实验 worktree，检查状态后使用 `git pull --ff-only`，不要强制重置。

CI 使用 Node 20；其他 Node 版本应记录下来，尤其注意 node-pty 的原生模块构建。硬件编码要求兼容的 NVIDIA GPU、驱动和 NVENC FFmpeg；仅有 `nvidia-smi` 输出或编码器名称不等于实际导出成功。

本地全新安装曾在已有 `electron-icon-builder` 依赖链的 PhantomJS 安装脚本失败。仅在确认是此类无关安装脚本问题时，可使用以下开发测试替代流程：

```powershell
npm ci --ignore-scripts
npm rebuild esbuild electron node-pty
npm run build
```

这不是完整打包验证；跳过的图标工具未恢复前不要据此宣称打包通过。如果 node-pty 重建失败，先检查匹配的 Node/Electron ABI、Python 和 Visual Studio C++ 工具，不修改全局环境或绕过 TLS 校验。

## 短视频测试

```powershell
# 强制硬件编码 + ANGLE，Windows 应实际调用 h264_nvenc
npm run test:remotion:gpu

# 软件出帧/软件编码对照
npm run test:remotion:gpu -- --software

# 紧凑气泡布局
npm run test:remotion:gpu -- --compact

# 若 SSH 会话下 ANGLE 不可用，单独验证硬件编码
npm run test:remotion:gpu -- --gl=swangle
```

- 测试为 1280×720、30 fps、4 秒、120 帧，固定并发 2，包含中文、Markdown、左右气泡、头像、打断、注释和阴影。
- 默认 `hardwareAcceleration: 'required'`，不允许悄悄降级软件编码。成功编码后还要断言 FFmpeg 实际使用预期编码器、检查视频尺寸/帧率/时长和首尾快照不同。
- 首次执行可能下载匹配的 Chrome Headless Shell；浏览器始终无头运行，结束后关闭。输出、三张关键帧 PNG 和 `report.json` 保留在命令打印的系统临时目录中，Bundle 临时文件自动清理。
- Windows 成功标志为 `POMCHAT_GPU_SMOKE_PASS`，报告中 `success: true` 且 `encoders` 包含 `h264_nvenc`。macOS 对应 VideoToolbox，不可用 Mac 结果代替 NVIDIA 验证。
- `requestedGl: angle` 仅记录请求的后端，并不证明浏览器正在使用物理 GPU。`--gl=swangle` 成功只能证明硬件编码链路，不能作为 GPU 画面渲染通过的依据。
- 快照断言只是基本健全性检查，不是完整像素回归；仍需人工查看中文换行、阴影、紧凑布局等。
- 这是 Composition/编码器测试，不等于 Electron IPC、项目资源迁移、音频合并、透明导出、取消或安装包全部通过。
- 比较性能时使用相同布局与质量目标，区分冷启动和热缓存；CPU 使用 CRF、硬件使用码率，不能直接当成等画质基准。

## 后续客户端验证

在 Windows 实验 worktree 中运行 `npm run dev`，使用临时测试项目选 GPU 导出普通 MP4：

1. 验证 Electron -> worker -> Remotion -> 输出文件的完整流程。
2. 分别检查三个质量档、声音、GIF/视频资源、普通/紧凑模式与导出范围。
3. 验证无硬件编码器或硬件失败时的软件回退；不要为了测试而卸载驱动或修改系统设置。
4. 另测透明 MOV/WebM、并行分段、离线浏览器与 Windows 安装包。

请不要更改真实项目或启用自动 biliup 投稿来测试导出。

## 已知验证状态

准备分支阶段：

- macOS：`npm run build`、`npm run test:biliup`、测试脚本 ESLint 和 JS 语法检查通过。
- macOS：普通模式软件编码短片通过；紧凑模式强制 VideoToolbox 编码短片通过。
- Windows：确认主仓库干净、基线为 `e60386a`，Node `26.8.1` / npm `11.19.0`，RTX 3060 Ti（8GB）、驱动 `610.88`。
- Windows：新版依赖安装、NVENC 短片、完整客户端导出及安装包测试仍待执行；上述环境检查不代表这些测试已通过。

参考：[Remotion 硬件编码文档](https://www.remotion.dev/docs/hardware-acceleration)。
