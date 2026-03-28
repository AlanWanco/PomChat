export const demoConfig = {
  projectId: "demo",
  projectTitle: "横版测试 Demo",
  fps: 60,
  dimensions: { width: 1920, height: 1080 },
  chatLayout: {
    paddingTop: 48,
    paddingBottom: 80, // 底部留白，控制新气泡出现的高度
    paddingX: 48,
    paddingLeft: 48,
    paddingRight: 48,
    bubbleScale: 1.5,
    avatarSize: 80,
    speakerNameSize: 22,
    animationStyle: "rise",
    animationDuration: 0.25
  },
  audioPath: "/projects/demo/assets/test_audio.aac",
  assPath: "/projects/demo/assets/ass_test.ass",
  background: {
    image: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1920&q=80",
    blur: 8 // px
  },
  ui: {
    themeColor: "#9ca4b8"
  },
  speakers: {
    "A": { 
      name: "主播A", 
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=A", 
      side: "left", 
      style: { 
        bgColor: "#2563eb", 
        textColor: "#ffffff", 
        borderRadius: 28,
        opacity: 0.9,
        borderWidth: 0,
        avatarBorderColor: "#ffffff",
        borderColor: "#ffffff",
        borderOpacity: 1.0,
        margin: 14,
        paddingX: 20,
        paddingY: 12,
        shadowSize: 7,
        nameColor: "#ffffff",
        fontFamily: "system-ui",
        fontSize: 30,
        fontWeight: "normal",
        scale: 1.0
      }
    },
    "B": { 
      name: "嘉宾B", 
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=B", 
      side: "right", 
      style: { 
        bgColor: "#f3f4f6", 
        textColor: "#111827", 
        borderRadius: 28,
        opacity: 0.9,
        borderWidth: 0,
        avatarBorderColor: "#ffffff",
        borderColor: "#ffffff",
        borderOpacity: 1.0,
        margin: 14,
        paddingX: 20,
        paddingY: 12,
        shadowSize: 7,
        nameColor: "#ffffff",
        fontFamily: "system-ui",
        fontSize: 30,
        fontWeight: "normal",
        scale: 1.0
      }
    },
    "ANNOTATION": {
      name: "注释",
      avatar: "",
      side: "center",
      type: "annotation",
      style: {
        bgColor: "#111827",
        textColor: "#ffffff",
        borderRadius: 999,
        opacity: 0.9,
        borderWidth: 0,
        avatarBorderColor: "#ffffff",
        borderColor: "#ffffff",
        borderOpacity: 1,
        margin: 12,
        paddingX: 18,
        paddingY: 10,
        shadowSize: 7,
        maxWidth: 720,
        fontFamily: "system-ui",
        fontSize: 24,
        fontWeight: "normal",
        annotationPosition: "bottom"
      }
    }
  },
  content: []
};
