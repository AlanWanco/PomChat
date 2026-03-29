<p align="center">
  <img src="https://raw.githubusercontent.com/AlanWanco/PomChat/refs/heads/main/podchat-icon.png" alt="PomChat logo" width="200" />
</p>

<h1 align="center">PomChat Studio</h1>

<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=111827" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Electron-191970?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Remotion-0F172A?style=flat-square&logo=remotion&logoColor=white" alt="Remotion" />
  <img src="https://img.shields.io/badge/WaveSurfer.js-0EA5E9?style=flat-square&logoColor=white" alt="WaveSurfer.js" />
</p>

> 你电脑里的又一个Electron @cﾒ*˶ˆ ᴗ ˆ˵ﾘ  
> 安装包这么大，我也不想的啊😭  
> 不过看了眼不渲染的时候占内存倒还好（心虚）  
> 以上是这篇README里所有的人类文字了

PomChat Studio 是一个以桌面端为主的聊天对话视频编辑工具，用来把本地音频、ASS 字幕和角色样式整理成聊天气泡风格的视频内容。

它的主要功能聚焦在“字幕驱动的聊天视频”这个场景：你可以导入音频和 ASS 字幕，配置角色头像、气泡颜色、边距、字体、动画和画布布局，然后一边预览一边调整，最后导出成视频。

[English README](https://github.com/AlanWanco/PomChat/blob/main/README.en.md)

## 技术栈

- React
- TypeScript
- Vite
- Electron
- Remotion
- WaveSurfer.js
- Tailwind CSS

## 适合做什么

PomChat Studio 适合这些场景：

- 把播客、对话、配音内容整理成聊天记录风格的视频
- 基于已有 ASS 字幕快速生成双人或多人对话画面
- 制作带头像、说话人名称、注释气泡的竖屏或横屏内容
- 在导出前精调字幕时间、角色样式和整体排版

如果你已经有音频和字幕，PomChat Studio 可以把后续的“对话可视化”流程集中到一个项目里处理。

PomChat虽然提供了字幕的基础修改功能，但它并非为大量修改字幕/翻译设计，推荐在Aegisub里完善后再导入PomChat

## 核心能力

- 导入本地音频和 ASS 字幕文件
- 编辑字幕文本、开始时间、结束时间和说话人归属
- 配置角色头像、名称、气泡颜色、字体、边框、阴影和动画
- 支持白天 / 黑暗模式，以及最多 13 组主题色与次主题色自由切换
- 支持注释型气泡和普通说话人气泡
- 跟随音频实时预览聊天排版效果
- 支持设置导出起止区间和文件名模板
- 通过 Electron 读写本地项目文件、配置和导出产物

## 主要功能

### 1. 字幕编辑

- 新增、删除、排序字幕行
- 修改字幕文本内容
- 修改字幕开始和结束时间
- 切换当前字幕归属的说话人
- 保留 ASS 工作流，适合已有字幕素材继续加工

### 2. 角色与气泡样式

- 设置说话人头像和名字
- 自定义左右气泡样式
- 调整字体、字号、字重、颜色
- 调整圆角、边框、透明度、阴影
- 调整内边距、外边距、最大宽度等布局参数

### 3. 布局与预览

- 支持横屏和竖屏尺寸
- 调整全局缩放、头像大小、名字字号
- 调整聊天区域 padding 和注释位置
- 音频驱动实时预览
- 预览和导出现在尽量共用同一套聊天渲染逻辑，减少样式漂移

### 4. 播放与导出

- 拖动播放、循环播放、记忆播放位置
- 快速设置导出范围
- 使用文件名模板生成导出文件名
- 导出聊天视频到本地目录

## 基本使用流程

1. 打开应用
2. 创建新项目，或打开已有项目配置
3. 导入音频文件
4. 导入 ASS 字幕文件
5. 检查字幕和说话人映射是否正确
6. 调整角色头像、气泡、字体和布局
7. 在预览区跟随音频检查画面效果
8. 设置导出范围、导出目录和文件名模板
9. 导出最终视频

## 项目文件与本地配置

PomChat Studio 同时有“项目配置”和“本地偏好”两类数据：

- **项目配置**：和当前视频项目有关，比如音频路径、字幕路径、角色样式、布局、背景、导出参数等
- **本地偏好**：和当前机器有关，比如主题色、界面偏好、最近项目等

当前本地配置目录使用：

- `~/.config/pomchat`

这意味着你在不同机器上可以有不同的本地偏好，但项目文件本身仍然可以单独保存和共享。

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

开发模式下会启动基于 Vite 的界面和 Electron 开发流程。

## 构建

### 构建应用

```bash
npm run build
```

这会构建前端和 Electron 相关输出。

### 本地打包 Electron 应用

```bash
npm run dist
```

打包产物会输出到：

- `release/`

## 导出性能说明

当前导出仍以 CPU 渲染和编码为主，暂未适配 GPU 导出加速。

以 `Mac mini M4`、未启用 GPU 加速为例，大致可以参考：

- `30 FPS`：导出速度约为 `0.6x`
- `60 FPS`：导出速度约为 `1x`

以 `i5-10400f`、未启用 GPU 加速为例:
- `30 FPS`：导出速度约为 `1.3x`
- `60 FPS`：导出速度约为 `2.6x`

实际速度仍会受到字幕数量、背景图、动画、分辨率、磁盘速度和系统负载影响。

## GitHub Actions

仓库内已经包含 Electron 自动构建和手动发布工作流。

### 自动构建

- Workflow：`Build Electron Apps`
- 触发方式：推送到 `main` 或手动触发
- 作用：构建多平台 Electron 产物

### 手动发布 Release

- Workflow：`Release Electron Apps`
- 触发方式：手动输入 tag、release 名称和目标分支
- 作用：创建 GitHub Release，并上传构建好的产物

当前发布目标包括：

- macOS arm64
- Windows x64
- Windows arm64
- Linux x64
- Linux arm64

Windows 会同时产出：

- 安装版 `nsis`
- 绿色解压版 `zip`

## 目录结构

- `src/App.tsx`：主应用流程、项目加载、预览集成、导出入口
- `src/components/`：编辑面板、播放器、导出弹窗、欢迎页、共享聊天组件
- `src/components/chat/`：预览和导出共用的聊天气泡渲染逻辑
- `src/remotion/`：Remotion 导出组合和类型定义
- `src/hooks/useAssSubtitle.ts`：ASS 解析与字幕加载
- `electron/`：Electron 主进程、预加载脚本和渲染工作进程
- `.github/workflows/`：CI 构建和发布工作流

## 开发说明

- 当前项目主要面向 Electron 本地桌面使用场景
- Windows 下本地音频和图片路径已经按 `file://` 形式统一处理
- 顶部原生 Electron 菜单栏在 Windows / Linux 下默认隐藏
- 构建产物目录如 `release/`、`dist-electron/` 已经加入忽略规则，避免污染提交记录

## 目前已知情况

- 开发环境下仍可能看到部分 Vite / Electron 警告日志
- 一些 Electron 配置仍偏开发态，后续可以继续收紧
- 如果你改了项目名或本地配置目录，旧版本的本地偏好不会自动迁移
- 导出视频中某些元素可能出现约 1~2 像素的轻微抖动，原因大概率与小数像素布局和逐帧渲染取整有关

## Todo

- [ ] 增加 GPU 导出加速支持，例如 macOS `VideoToolbox` 等硬件编码路径
- [ ] 增加信息文字块，支持自由放置在上方、左侧、右侧、下方，用于显示节目名、更新时间等上下文信息
- [ ] 增加单张图片插入能力，既支持作为信息流内容插入，也支持自由位置插入
- [ ] 单张图片支持独立动画效果，用于补充说明、过渡或强调内容
- [ ] 导入 ASS 文件时支持从已有样式里自动取色
- [x] 增加 GitHub 静态页面版本，提供字幕与音频导入的基础预览功能
- [ ] 静态版本增加手机竖屏排版
- [ ] 增加检查更新功能
