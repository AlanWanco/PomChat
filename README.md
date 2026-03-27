# 烤肉Man专用视频生成器 - Demo

基于文档 `doc.md` 需求开发的 Web 前端原型 Demo。
该 Demo 实现了一个可以根据时间轴动态播放气泡对话的手机模拟界面，适合之后作为 Electron 客户端的核心展示层或 Web 调试端。

## 技术栈
- React + TypeScript (Vite 构建)
- Tailwind CSS v4 (样式引擎)
- 完全组件化的 `mockData.ts` 数据结构（与最终将交由 Remotion 渲染的数据结构保持一致）

## 启动指南
```bash
npm install
npm run dev
```

打开浏览器，点击底部的“播放时间轴”，即可预览根据配置自动弹出的聊天对话。
