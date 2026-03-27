好的，既然决定采用 **Remotion** 作为核心渲染引擎，结合你的“烤肉man”业务需求（ASS解析、聊天气泡、Podcast转视频），我为你整理了这份技术方案文档。

这份文档可以直接作为你项目的**开发蓝图**。

---

# 🛠️ 烤肉Man专用：电台/Podcast 聊天流视频生成器方案

## 一、 项目愿景
**核心目标**：将纯音频的 Radio/Podcast，通过导入带时间轴的字幕文件（ASS/SRT），自动生成类似 QQ/Telegram 风格的聊天对话动态视频，解决传统视频剪辑软件制作对话流效率低下的痛点。

---

## 二、 技术栈选型 (Tech Stack)

| 模块 | 推荐技术 | 理由 |
| :--- | :--- | :--- |
| **基础框架** | **React + TypeScript** | Remotion 的强制要求，TS 能极大减少处理复杂字幕数据时的 Bug。 |
| **渲染引擎** | **Remotion** | **核心选型**。负责将 Web 代码渲染为视频，支持多进程并行渲染、FFmpeg 自动压制。 |
| **UI 样式** | **Tailwind CSS** | 快速实现聊天气泡的各种变形、阴影、夜间模式。 |
| **字幕解析** | **ass-compiler** | 将 ASS 原始文本解析为可操作的 JSON 对象（提取 Actor、Style、\N 等）。 |
| **音频处理** | **Wavesurfer.js** | 前端预览时显示波形图，方便手动微调字幕对齐时间。 |
| **桌面外壳** | **Electron** | 提供本地文件系统读写权限，方便管理项目模版、头像素材和导出视频到本地。 |

---

## 三、 核心功能实现逻辑

### 1. ASS 字幕深度适配
* **解析逻辑**：利用 `ass-compiler` 提取 `Dialogue` 里的 `Layer`（层级）、`Start/End`（时间轴）、`Actor`（说话人）和 `Text`。
* **换行处理**：通过正则匹配 `\N`，在 React 中将其转换为 `<br />` 或独立的 `div` 块。
* **样式映射**：根据 ASS 的 `Style` 字段，匹配预设的 CSS 类（例如：主播 A 使用粉色气泡，嘉宾 B 使用蓝色气泡）。

### 2. 后台“离线”渲染流程 (Remotion 核心)
不同于前端录屏，Remotion 的导出逻辑如下：
1.  **分片渲染**：Remotion 开启多个 Puppeteer 实例。
2.  **帧抓取**：根据 FPS（如 60fps），每个实例负责渲染特定区间的每一帧并截图。
3.  **管道传输**：图片 Buffer 实时传给 FFmpeg。
4.  **硬件加速**：配置编码器（如 `h264_nvenc`），利用显卡加速压制。

### 3. 编辑器预览 (Electron 端)
* **双模式预览**：
    * **快速预览**：标准的 HTML 渲染，随音频播放滚动气泡。
    * **Remotion Player**：在导出前进行“帧对齐”检查。
* **配置保存**：以 JSON 格式存储不同项目的模版（头像路径、气泡 CSS 属性、视频分辨率/码率）。

---

## 四、 导出性能优化方案

* **并行渲染 (Concurrency)**：利用 Remotion 的 `npx remotion render` 自动识别 CPU 核心数。如果你是 8 核 CPU，导出速度将接近实时（10分钟视频约 10-15 分钟导出）。
* **按需加载**：视频中的图片（头像、插入图）在导出时通过本地文件协议直接注入，避免网络带宽瓶颈。
* **显卡压制**：在 Electron 中检测系统环境，动态为 FFmpeg 挂载 `-c:v h264_nvenc` 或 `-c:v videotoolbox` 参数。

---

## 五、 数据结构示例 (核心：Video Metadata)
导出给 Remotion 渲染的 JSON 格式建议：

```json
{
  "projectTitle": "深夜电台第5期",
  "fps": 60,
  "dimensions": { "width": 1080, "height": 1920 },
  "audioPath": "C:/assets/podcast_v5.mp3",
  "speakers": {
    "A": { "name": "烤肉Man", "avatar": "man.png", "side": "left", "theme": "dark" },
    "B": { "name": "嘉宾", "avatar": "guest.png", "side": "right", "theme": "light" }
  },
  "content": [
    { "start": 0.5, "end": 2.1, "speaker": "A", "type": "text", "text": "大家好！今天我们聊聊翻译。" },
    { "start": 2.2, "end": 4.5, "speaker": "B", "type": "image", "url": "meme.jpg" }
  ]
}
```

---

## 六、 开发者起步建议

1.  **环境准备**：安装 Node.js，执行 `npx create-remotion@latest` 先体验 Remotion 的默认 Demo。
2.  **攻克样式**：在 Remotion 中先用纯 CSS 画出一个静态的聊天界面（头像+气泡）。
3.  **接入数据**：尝试写一个简单的脚本，把你的 ASS 文件转成上面的 JSON 格式。
4.  **Electron 集成**：最后再用 Electron 把这个 Web 项目包起来，实现文件选择和本地导出。

