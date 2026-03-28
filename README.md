# PodChat Studio

用于编辑本地音频 + ASS 字幕对话视频项目的桌面 / Web 调试工具。

当前项目已经不再只是早期 Demo，现阶段主要提供：

- 基于音频时间轴的聊天气泡预览
- ASS 字幕导入、清理空白行、单条增删改、按开始时间排序
- 角色配置、预设样式、单条字幕切换说话人
- 项目级画面尺寸、布局、动画、背景、主题色 / 次主题色设置
- Electron 本地文件读写、拖拽导入 `json` / `ass` / 音频文件
- 保存项目时同步回写 ASS 文件内容

## 技术栈

- React 19 + TypeScript
- Vite 8
- Tailwind CSS v4
- Electron
- WaveSurfer.js
- ass-compiler

## 核心功能

- **项目配置**：保存/打开项目配置，支持全局缓存恢复
- **ASS 字幕**：导入 ASS 文件、清理空白行、单条编辑、按时间排序
- **字幕管理**：时间轴编辑、删除、排序、说话人切换、自动创建同名 `.ass`
- **预览**：实时音频驱动的聊天气泡动画预览、横竖屏切换
- **导出**：基于 Remotion 的视频导出，支持自定义导出范围
- **角色配置**：气泡样式、字体、颜色、阴影、动画参数个性化
- **播放控制**：记住播放位置、调整播放速度、循环播放

## 开发启动

安装依赖：

```bash
npm install
```

启动前端开发环境：

```bash
npm run dev
```

构建：

```bash
npm run build
```

## 说明

- `electron/main.ts`：Electron 主进程入口
- `electron/remotion-worker.cjs`：后台视频渲染进程
- 主题色、次主题色、界面主题为全局偏好，不跟项目配置绑定

## 主要目录

- `src/App.tsx`：主应用流程、项目加载、预览渲染、字幕持久化
- `src/components/`：编辑面板、字幕列表、播放器、导出对话框等
- `src/remotion/`：Remotion 视频导出组件和类型定义
- `src/hooks/useAssSubtitle.ts`：ASS 解析与字幕数据生成
- `electron/`：Electron 主进程、预加载脚本、后台 Remotion 工作进程

## 已知现状

- 开发环境下仍会看到部分 Vite / Electron 警告日志
- Electron 安全相关配置仍偏开发态，后续可再收紧
