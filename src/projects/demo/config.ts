export const demoConfig = {
  projectId: "demo",
  projectTitle: "横版测试 Demo",
  fps: 60,
  dimensions: { width: 1920, height: 1080 },
  audioPath: "/projects/demo/assets/test_audio.aac",
  assPath: "/projects/demo/assets/ass_test.ass",
  speakers: {
    "A": { name: "主播A", avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=A", side: "left", theme: "dark" },
    "B": { name: "嘉宾B", avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=B", side: "right", theme: "light" }
  },
  content: [
    // This will eventually be replaced by the parsed ASS file data
    { start: 0.5, end: 2.1, speaker: "A", type: "text", text: "测试一下横版视频效果！" },
    { start: 2.2, end: 4.5, speaker: "B", type: "text", text: "好的，横版的空间更大了。" },
    { start: 4.6, end: 6.0, speaker: "A", type: "text", text: "接下来我们来接入这个音频和 ASS 文件。" },
  ]
};
