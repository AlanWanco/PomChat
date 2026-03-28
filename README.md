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

## 当前能力

- 项目配置保存 / 打开
- ASS 导入与角色映射
- 无 ASS 时，首次添加单条字幕会在项目配置同目录自动创建同名 `.ass`
- 字幕时间轴编辑、删除、排序、说话人切换
- 预览区横竖屏尺寸切换
- 主题色 / 次主题色驱动的大部分编辑器界面
- 记住播放位置并在下次打开时恢复

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

- 当前 `npm run dev` 主要用于 Vite 开发调试
- Electron 入口位于 `electron/main.ts`
- Demo 项目配置位于 `src/projects/demo/config.ts`
- 主题色、次主题色、界面主题等属于全局偏好，不跟项目配置绑定

## 主要目录

- `src/App.tsx`：主流程、项目加载、预览、字幕持久化
- `src/components/`：设置面板、字幕列表、播放器、欢迎页、菜单栏等
- `src/hooks/useAssSubtitle.ts`：ASS 解析与字幕数据生成
- `src/projects/demo/`：内置 Demo 配置与资源路径
- `electron/`：Electron 主进程与 preload

## 已知现状

- 开发环境下仍会看到部分 Vite / Electron 警告日志
- Electron 安全相关配置仍偏开发态，后续可再收紧
- 部分 UI 主题化仍在持续打磨中
