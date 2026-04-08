# AGENT Notes

## GitHub Pages Direction

PomChat can support a GitHub Pages version, but it should be treated as a web preview edition rather than a full desktop replacement.

### Goal

Split the product into two layers:

- Electron desktop app: full feature set
- GitHub Pages web app: preview-focused subset

The web version should support subtitle and audio import, style adjustment, and live preview, while keeping export and system-level features desktop-only.

### Web Version Scope

Features that are good candidates for GitHub Pages:

- Import subtitle files
- Import audio files
- Basic chat preview
- Subtitle browsing and light editing
- Speaker style editing
- Layout and theme adjustment
- Animation preview
- Local browser storage

Features that should remain desktop-only for now:

- Video export
- Electron file system integration
- Native open/save dialogs
- Local config directory support
- Main-process remote asset caching
- Platform packaging features

### Recommended Architecture

1. Define a clear web support boundary

- Web version should focus on preview and lightweight editing
- Desktop version keeps full local-file and export workflow

2. Abstract platform capabilities

Create a platform layer instead of scattering `window.electron` checks throughout the app.

Examples of platform APIs:

- `openProjectFile()`
- `saveProjectFile()`
- `readTextFile()`
- `pickImage()`
- `pickAudio()`
- `exportVideo()`
- `cacheRemoteAsset()`

Implement at least:

- `electronPlatform`
- `webPlatform`

3. Move from file paths to resource references

Web mode should not depend on absolute file paths.

Use a more generic media reference model, such as:

```ts
type MediaRef = {
  kind: 'local-file' | 'remote-url' | 'blob-url';
  src: string;
  originalName?: string;
};
```

4. Keep project config web-compatible

Web mode should avoid assuming desktop file paths are reusable.

Initial recommended approach:

- Use session/local preview data in the browser
- Save lightweight project JSON
- Re-request media files when needed in web mode

5. Keep preview logic purely front-end

Preview should work with:

- React
- browser audio elements
- object URLs
- remote URLs

It should not require Electron APIs.

6. Desktop-only export fallback

On GitHub Pages:

- either hide export controls
- or show them in a disabled state with a note that export is desktop-only

### Suggested Rollout Order

1. Extract a platform API layer
2. Make audio / subtitle / image import work in web mode
3. Ensure preview runs without Electron
4. Add GitHub Pages deployment workflow
5. Keep export desktop-only until a separate web export strategy is designed

### Product Framing

Recommended positioning:

- Electron app: full production editor
- GitHub Pages app: lightweight preview edition

This keeps the web version useful without overcommitting to unsupported desktop-only features.

## Current Implementation Notes (v0.1.2)

### Project Defaults

- Demo-config dependency has been removed from runtime initialization.
- The app now uses in-app defaults (`DEFAULT_PROJECT_CONFIG`) instead of importing `src/projects/demo/config.ts`.
- Storage key has been unified to `pomchat_config` (legacy `pomchat_demo_config` should be considered deprecated).

### Subtitle Formats

- Supported subtitle imports: `ASS`, `SRT`, `LRC`.
- `SRT/LRC` use default speaker assignment (first non-annotation speaker).
- For `SRT/LRC`, subtitle edits are saved to project `content` and are not written back to ASS files.
- `subtitleFormat` (`ass | srt | lrc`) is used to choose loading and persistence behavior.

### Web and Mobile Web

- Web mode includes preset import/export support.
- Mobile web layout includes:
  - top preview + playback controls
  - bottom tab panel (collapsible/resizable/expandable)
- Waveform is rendered via a dedicated container and should only consume layout space when audio is available and initialized.

### Export Boundary

- Export remains desktop-first by design.
- Web export is intentionally not enabled yet due to heavy browser-side rendering/encoding cost, memory pressure, file-system limitations, and long-task reliability concerns.

### Guardrails for Future Changes

- Avoid reintroducing hardcoded demo asset paths into default project state.
- When changing subtitle load logic, verify all three restore paths still work:
  - localStorage restore (web)
  - JSON open/import (web)
  - JSON open (desktop)
- Keep preview scale and bubble scale behavior synchronized between preview and render paths.

## Release Note Guideline

For future release notes, use a concise bullet format.

- Keep it short (about 4-6 bullets).
- Focus on user-visible changes only.
- Start with major fixes and stability items, then features.
- Avoid deep technical details, implementation history, or long background.

Recommended template:

```md
## vX.Y.Z(-beta.N)

- Fix: <important bug fix>
- Improve: <stability/performance update>
- Add: <new user-facing feature>
- Add: <another feature if needed>
- Adjust: <default/style/workflow tweak>
```

PomChat style preference:

- Mention jitter fix status when relevant (especially export/preview consistency).
- Mention hardware mode support as capability + stability fallback, but keep wording lightweight.
- Keep language straightforward and brief.
