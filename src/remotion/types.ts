export interface ExportRange {
  start: number;
  end: number;
}

export interface SubtitleContentItem {
  start: number;
  end: number;
  speaker: string;
  type: 'text';
  text: string;
}

export interface SpeakerStyle {
  bgColor?: string;
  textColor?: string;
  nameColor?: string;
  borderRadius?: number;
  opacity?: number;
  borderWidth?: number;
  avatarBorderColor?: string;
  borderColor?: string;
  borderOpacity?: number;
  margin?: number;
  paddingX?: number;
  paddingY?: number;
  annotationBorderRadius?: number;
  shadowSize?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  nameFontFamily?: string;
  nameFontWeight?: string;
  scale?: number;
  maxWidth?: number;
  annotationPosition?: 'top' | 'bottom';
  animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
}

export interface SpeakerConfig {
  name?: string;
  avatar?: string;
  side?: 'left' | 'right' | 'center';
  type?: 'speaker' | 'annotation';
  theme?: 'dark' | 'light';
  style?: SpeakerStyle;
}

export interface PodchatExportInput {
  projectTitle?: string;
  fps: number;
  dimensions: {
    width: number;
    height: number;
  };
  audioPath?: string;
  background?: {
    image?: string;
    blur?: number;
    brightness?: number;
  };
  chatLayout?: {
    paddingTop?: number;
    paddingBottom?: number;
    paddingX?: number;
    paddingLeft?: number;
    paddingRight?: number;
    bubbleScale?: number;
    avatarSize?: number;
    speakerNameSize?: number;
    animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
    animationDuration?: number;
  };
  speakers: Record<string, SpeakerConfig>;
  content: SubtitleContentItem[];
  exportRange: ExportRange;
}
