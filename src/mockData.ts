export const mockData = {
  "projectTitle": "深夜电台第5期",
  "fps": 60,
  "dimensions": { "width": 1080, "height": 1920 },
  "audioPath": "C:/assets/podcast_v5.mp3",
  "speakers": {
    "A": { "name": "烤肉Man", "avatar": "https://api.dicebear.com/7.x/adventurer/svg?seed=man", "side": "left", "theme": "dark" },
    "B": { "name": "嘉宾", "avatar": "https://api.dicebear.com/7.x/adventurer/svg?seed=guest", "side": "right", "theme": "light" }
  },
  "content": [
    { "start": 0.5, "end": 2.1, "speaker": "A", "type": "text", "text": "大家好！今天我们聊聊翻译。" },
    { "start": 2.2, "end": 4.5, "speaker": "B", "type": "text", "text": "没错，其实剪辑播客视频一直是个痛点。" },
    { "start": 4.6, "end": 6.0, "speaker": "A", "type": "text", "text": "所以我们打算用Remotion做个自动生成的工具！" },
    { "start": 6.1, "end": 8.5, "speaker": "B", "type": "image", "url": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=300&q=80" }
  ]
};
