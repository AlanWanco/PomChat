export interface ExportRange {
  start: number;
  end: number;
}

export interface BackgroundSlideItem {
  id: string;
  type?: 'image' | 'text';
  name?: string;
  image?: string;
  text?: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  start: number;
  end: number;
  fit?: 'cover' | 'contain' | 'fill';
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  backgroundOrder?: number;
  overlayOrder?: number;
  layer?: 'background' | 'overlay';
  inheritBackgroundFilters?: boolean;
  animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
  animationDuration?: number;
  opacity?: number;
  imageBorderColor?: string;
  imageBorderWidth?: number;
  imageShadowColor?: string;
  imageShadowSize?: number;
  textColor?: string;
  textStrokeColor?: string;
  textStrokeWidth?: number;
  textShadowColor?: string;
  textShadowSize?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
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
  nameStrokeWidth?: number;
  nameStrokeColor?: string;
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
  trackIndex?: number;
  trackPaddingLeft?: number;
  trackPaddingRight?: number;
  annotationPosition?: 'top' | 'bottom';
  annotationAlign?: 'left' | 'center' | 'right';
  annotationMarginX?: number;
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
  transparentBackground?: boolean;
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
    fit?: 'cover' | 'contain' | 'fill';
    position?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    duration?: number;
    slides?: BackgroundSlideItem[];
  };
  chatLayout?: {
    paddingTop?: number;
    topFadeEnabled?: boolean;
    topFadeHeight?: number;
    paddingBottom?: number;
    paddingX?: number;
    paddingLeft?: number;
    paddingRight?: number;
    bubbleScale?: number;
    bubbleMaxWidthPercent?: number;
    avatarSize?: number;
    speakerNameSize?: number;
    animationStyle?: 'none' | 'fade' | 'rise' | 'pop' | 'slide' | 'blur';
    animationDuration?: number;
    maxVisibleBubbles?: number;
    showAvatar?: boolean;
    showSpeakerName?: boolean;
    showTimestamp?: boolean;
    showMeta?: boolean;
    compactMode?: boolean;
    compactSpacing?: number;
    independentTracksEnabled?: boolean;
    trackCount?: number;
  };
  speakers: Record<string, SpeakerConfig>;
  content: SubtitleContentItem[];
  exportRange: ExportRange;
}
