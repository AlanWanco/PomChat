# PomChat Studio

PomChat Studio is a desktop-first chat video editor for turning local audio, ASS subtitles, and speaker styling into chat-style dialogue videos.

It is not meant to be a general-purpose video editor. Instead, it focuses on a specific workflow: import audio and subtitles, assign speakers, tune bubble and layout styles, preview the result in real time, and export a finished chat-style video.

[Chinese README](https://github.com/AlanWanco/PomChat/blob/main/README.md)

## What It Is Good For

PomChat Studio works well for cases like:

- Turning podcasts or spoken dialogue into chat-style videos
- Reusing existing ASS subtitles for character-based visual conversations
- Creating vertical or horizontal chat layouts with avatars and speaker names
- Fine-tuning subtitle timing, spacing, and speaker presentation before export

If you already have audio and subtitles, PomChat Studio is designed to handle the visualization part of that workflow in one place.

## Core Capabilities

- Import local audio and ASS subtitle files
- Edit subtitle text, start and end time, and speaker assignment
- Configure avatars, names, bubble colors, fonts, borders, shadows, and animation
- Support both normal speaker bubbles and annotation-style bubbles
- Preview the conversation layout in real time while the audio plays
- Set export ranges and filename templates
- Read and write project files locally through Electron

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

- `~/.config/pomchat`

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
- Local Windows audio and image paths are now normalized to `file://` URLs
- The native Electron menu bar is hidden by default on Windows and Linux
- Generated folders such as `release/` and `dist-electron/` are ignored to keep the repo clean

## Current Notes

- You may still see some Vite or Electron warnings in development mode
- Some Electron settings are still development-oriented and may be tightened later
- If the app name or local config directory changes, old local preferences are not migrated automatically

## Todo

- Add GPU-accelerated export support, such as hardware encoder paths like macOS `VideoToolbox`
- Add information text blocks that can be placed at the top, left, right, or bottom for program title, update time, and similar context
- Add support for inserting a single image either inside the message flow or as a freely positioned element
- Add standalone animation support for inserted images for supplemental, transition, or emphasis use cases
