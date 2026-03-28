# PomChat Studio

PomChat Studio is a desktop-first tool for turning local audio and ASS subtitles into chat-style dialogue videos.

It is built for editing speakers, bubble styles, layout, timing, and export settings in one place, with a live preview and Electron-based local file access.

## What It Does

- Import local audio and ASS subtitle files
- Edit subtitle lines, timing, speaker mapping, and text
- Configure speaker avatars, names, colors, padding, shadows, and animation
- Preview the conversation layout in real time while the audio plays
- Export a video with a selected time range and filename template
- Save project data locally and sync project-related config through Electron

## Main Features

- **Subtitle editing**: add, remove, sort, and update subtitle lines
- **Speaker styling**: customize avatars, bubble colors, fonts, borders, spacing, and theme
- **Layout control**: adjust canvas size, padding, bubble scale, avatar size, and annotation position
- **Playback tools**: scrub audio, loop playback, remember position, and set export range quickly
- **Video export**: render chat-style video output from the current project configuration

## Getting Started

### Install dependencies

```bash
npm install
```

### Start development

```bash
npm run dev
```

This starts the Vite-based app for local development.

## Basic Usage

1. Open the app
2. Import an audio file and an ASS subtitle file
3. Check or adjust speaker assignments
4. Edit subtitle content, timing, and styles as needed
5. Tune layout, animation, and export settings
6. Preview the result in the player area
7. Export the final video

## Build

Build the app bundles:

```bash
npm run build
```

Build an Electron package locally:

```bash
npm run dist
```

Packaged files are written to `release/`.

## GitHub Actions

This repository includes workflows for Electron builds and manual GitHub Releases.

- `Build Electron Apps`: multi-platform build artifacts
- `Release Electron Apps`: manually create and upload release assets

## Project Structure

- `src/App.tsx`: main application flow and preview integration
- `src/components/`: editor panels, player, export modal, shared chat UI
- `src/remotion/`: Remotion export composition and types
- `src/hooks/useAssSubtitle.ts`: ASS parsing and subtitle loading
- `electron/`: Electron main process, preload script, and render worker
- `.github/workflows/`: CI build and release workflows

## Notes

- The app is optimized for local desktop usage through Electron
- Some Electron settings are still development-oriented and may be tightened later
