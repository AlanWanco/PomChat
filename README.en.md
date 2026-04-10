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

PomChat Studio is a desktop-first chat video editor for turning local audio, ASS subtitles, and speaker styling into chat-style dialogue videos.

It is not meant to be a general-purpose video editor. Instead, it focuses on a specific workflow: import audio and subtitles, assign speakers, tune bubble and layout styles, preview the result in real time, and export a finished chat-style video.

[Chinese README](https://github.com/AlanWanco/PomChat/blob/main/README.md)

[Online Demo](https://alanwanco.github.io/PomChat/)

## What It Is Good For

PomChat Studio works well for cases like:

- Turning podcasts or spoken dialogue into chat-style videos
- Reusing existing ASS subtitles for character-based visual conversations
- Creating vertical or horizontal chat layouts with avatars and speaker names
- Fine-tuning subtitle timing, spacing, and speaker presentation before export

If you already have audio and subtitles, PomChat Studio is designed to handle the visualization part of that workflow in one place.

## Core Capabilities

- Import local audio and ASS subtitle files
- Support importing `ASS / SRT / LRC` subtitle files
- Detect ASS Name/Style on import, with optional style-to-bubble mapping (outline color -> bubble color, shadow/back color -> border color, primary color -> text color, Outline -> border width), including font name import/preview and select-all/select-none controls
- Edit subtitle text, start and end time, and speaker assignment; subtitle panel includes a lightweight compact mode (read-only with auto-follow for large subtitle sets)
- Configure avatars, names, bubble colors, fonts, borders, shadows, and animation
- Support image / GIF / video as background media, with fit modes (Cover/Contain/Fill) and alignment controls
- Support inserted image / text layers with per-layer ordering, timing, scale, rotation, offset, animation, text stroke, and shadow controls
- When dropping a background video, detect embedded audio and optionally reuse it as the project audio track
- Import/export style presets on both desktop and web, and auto-generate presets from detected ASS styles
- Mobile web layout is optimized with adaptive preview scaling, a collapsible/resizable bottom panel, and compact playback controls
- Switch freely between light and dark mode, with up to 13 theme and secondary color combinations
- Support both normal speaker bubbles and annotation-style bubbles
- Batch reassign subtitles before speaker deletion to prevent accidental fallback to annotation speaker
- Preview the conversation layout in real time while the audio plays
- Set export ranges and filename templates
- Read and write project files locally through Electron
- The web version can also be used as an ASS subtitle content viewer

## Main Features

### 1. Subtitle Editing

- Add, remove, sort, and update subtitle lines
- Edit subtitle text directly
- Adjust subtitle start and end time
- Reassign a subtitle line to a different speaker
- Keep an ASS-based workflow for existing subtitle assets

### 2. Speaker and Bubble Styling

- Set speaker avatars and display names
- Customize left and right bubble styles
- Tune font family, size, weight, and color
- Adjust corner radius, borders, opacity, and shadows
- Control padding, margins, and maximum bubble width

### 3. Layout and Preview

- Support both landscape and portrait canvas sizes
- Adjust global scale, avatar size, and speaker name size
- Tune chat area padding and annotation positions
- Preview the layout with audio-driven timing
- Preview and export now try to share the same chat rendering logic to reduce styling mismatches
- Inserted image / text layers now try to share the same transform and layering logic between preview and export to reduce positional drift

### 4. Playback and Export

- Scrub audio, loop playback, and remember playback position
- Set export range quickly
- Generate output filenames with templates
- Export the final chat video to a local folder

## Typical Workflow

1. Open the app
2. Create a new project or open an existing one
3. Import an audio file
4. Import an ASS subtitle file
5. Check subtitle timing and speaker assignments
6. Adjust speaker avatars, bubble styles, fonts, and layout
7. Review everything in the live preview
8. Set export range, output directory, and filename template
9. Export the final video

## Project Files and Local Config

PomChat Studio uses two kinds of data:

- **Project config**: audio path, subtitle path, speaker styles, layout, background, export options, and other project-related settings
- **Local preferences**: theme colors, UI preferences, recent projects, and other machine-specific settings

The local config directory is currently:

- Windows: `%USERPROFILE%\\.config\\pomchat`
- Linux: `~/.config/pomchat`
- macOS: `~/.config/pomchat`

ASS auto-backup directory (desktop) is currently:

- Windows: `%USERPROFILE%\\.config\\pomchat\\backup`
- Linux: `~/.config/pomchat/backup`
- macOS: `~/.config/pomchat/backup`

This means local preferences can differ per machine, while project files can still be saved and shared separately.

## Getting Started

### Install dependencies

```bash
npm install
```

### Start development

```bash
npm run dev
```

In development mode, the app runs through the Vite-based frontend and Electron development flow.

## Build

### Build the app

```bash
npm run build
```

This builds the frontend and Electron-related outputs.

### Package the Electron app locally

```bash
npm run dist
```

Packaged files are written to:

- `release/`

## Export Performance Notes

Export is currently still mainly CPU-based, and GPU-accelerated export has not been adapted yet.

As a rough reference on a `Mac mini M4` without GPU acceleration:

- `30 FPS`: around `0.6x`
- `60 FPS`: around `1x`

Actual speed still depends on subtitle density, background assets, animation usage, resolution, disk speed, and current system load.

## GitHub Actions

The repository already includes both automatic Electron builds and a manual GitHub Release workflow.

### Automatic builds

- Workflow: `Build Electron Apps`
- Trigger: push to `main` or manual dispatch
- Purpose: build multi-platform Electron artifacts

### Manual releases

- Workflow: `Release Electron Apps`
- Trigger: manual input of tag, release name, and target ref
- Purpose: create a GitHub Release and upload packaged assets

Current release targets include:

- macOS arm64
- Windows x64
- Windows arm64
- Linux x64
- Linux arm64

On Windows, the workflow produces both:

- `nsis` installer builds
- `zip` portable builds

## Project Structure

- `src/App.tsx`: main app flow, project loading, preview integration, and export entry
- `src/components/`: editor panels, player, export modal, welcome screen, and shared chat UI
- `src/components/chat/`: shared chat rendering logic used by both preview and export
- `src/remotion/`: Remotion export composition and types
- `src/hooks/useAssSubtitle.ts`: ASS parsing and subtitle loading
- `electron/`: Electron main process, preload script, and render worker
- `.github/workflows/`: CI build and release workflows

## Development Notes

- The project is mainly optimized for local desktop usage through Electron
- A web mode is also available for core editing flows (JSON/ASS/audio import, live preview, preset import/export)
- Mobile narrow-screen layout is supported in web mode (top preview+playback area, bottom tabbed panel)
- Local Windows audio and image paths are now normalized to `file://` URLs
- The native Electron menu bar is hidden by default on Windows and Linux

## Current Notes

- You may still see some Vite or Electron warnings in development mode
- Some Electron settings are still development-oriented and may be tightened later
- If the app name or local config directory changes, old local preferences are not migrated automatically
- Some exported videos may show slight 1-2 pixel jitter on certain elements, likely caused by sub-pixel layout values and per-frame rounding during rendering

## Release Notes

### v0.1.6-beta2

- Added media background support: image / GIF / video backgrounds now work with aligned preview/export behavior
- Added background fit and alignment controls: Cover / Contain / Fill plus 9-position alignment
- Added drag-and-drop background video audio detection with one-click option to adopt it as project audio
- Export now aligns background video playback to export start timestamps and loops consistently
- Added global bubble max-width control (default 70%, minimum 25%)
- Fixed export range start being reset when audio is reloaded
- Reduced residual bubble jitter and improved export error-copy ergonomics

### v0.1.5

- Added ASS font-name import and font preview column in style import, plus select-all/select-none controls
- Added subtitle list compact mode toggle (lightweight read-only view with playback auto-follow) for large subtitle projects
- Added batch speaker reassignment flow before deleting speakers, restricting targets to non-annotation speakers
- Added independent annotation animation style and font-weight controls, aligned between preview and export
- Updated ASS workflow behavior: stop writing back to source ASS on edit/import, and move automatic backups to runtime `backup` directory
- Fixed annotation speaker assignment being unintentionally reverted after style-only changes, and restored default annotation speaker in new projects

### v0.1.5-beta.1

- Fixed Windows local file path compatibility: audio, images, and other local assets now correctly handle `#`, `?`, `%`, spaces, and non-ASCII characters in paths
- Fixed Electron export dependency downloads: the Remotion browser is now bundled during packaging so first export no longer blocks on downloading under weak network conditions
- Fixed preview/export chat drift in long conversations: export ranges now reset correctly on project switches, and the chat stack keeps a stable bottom-anchored follow behavior
- Fixed waveform-to-timeline mismatch: default waveform zoom is now calibrated from the real audio duration so the waveform length better matches the actual track

## Todo

- [ ] Add GPU-accelerated export support, such as hardware encoder paths like macOS `VideoToolbox`
- [ ] Add information text blocks that can be placed at the top, left, right, or bottom for program title, update time, and similar context
- [ ] Add support for inserting a single image either inside the message flow or as a freely positioned element
- [ ] Add standalone animation support for inserted images for supplemental, transition, or emphasis use cases
- [ ] Add rotating background image support, allowing multiple backgrounds to switch or crossfade over time
- [ ] Add undo/redo support (subtitle edits, style changes, and layout adjustments)
- [x] Support importing ASS styles into speaker/bubble styles (including color, opacity, and border width)
- [x] Add a GitHub Pages version with basic subtitle and audio import preview capabilities
- [x] Add basic mobile portrait-oriented layout support for the static web version with a collapsible bottom panel
- [ ] Add an update-checking feature
