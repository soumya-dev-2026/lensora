# Changelog

## Unreleased

## 0.3.0 — 2026-09-26

### Added

- Automatic camera preview on studio load, with the existing permission and retry controls.
- Adjustable dark circle reduction and Super Beauty in Camera filters.
- Local performance diagnostics for preview rendering, segmentation, and face tracking.

### Improved

- Run person segmentation and face tracking in separate workers, with one pending frame per worker and stale face cleanup.
- Adapt preview rendering to sustained load; freeze render quality during recording while preserving output dimensions and full-resolution overlays.
- Skip redundant mask/feature texture uploads and camera copies while inference is busy.
- Cache public AI model files for repeat visits, with a loading fallback when browser storage is unavailable.
- Preserve the multiclass person model, all filter strengths, split camera, recording, overlays, and editor features.

### Fixed

- Use the module-compatible MediaPipe WASM loader inside workers.
- Compile the dark-circle shader without reserved GLSL identifiers.
- Enable face tracking for face effects even when background masking is off.

## 0.2.1 — 2026-09-10

### Fixed

- Release the active camera before switching to the opposite facing camera on mobile.
- Reopen the previous camera if switching fails, instead of restoring a stopped stream.
- Allow camera sensor startup time in split view, prefer an opposite-facing lens, and handle missing device IDs.
- Reduce secondary camera capture resolution and frame rate to ease concurrent capture.

## 0.2.0 — 2026-09-10

### Added

- Studio image overlays with opacity, size, drag positioning, and recording support.
- Saved sticker library with built-in presets and custom uploads remembered on this device.
- Searchable emoji popup with 116 emojis for captions, stickers, and editor overlays.
- Custom color wheel with brightness, hex entry, white/black-first presets, and opacity where supported.
- Editor noise reduction for original video audio, applied to preview and MP4 export.
- Image opacity in the video editor.
- Visible app version and commands for patch, minor, and major version updates.
- Android app packaging with native video sharing and a debug APK in `releases/`.

### Changed

- Compact studio and editor layouts, slim glossy editor sliders, and subtle mint gradient borders.
- Connected settings tabs and content panels; toolbar retains Background and Filters.
- Saved looks and Studio preferences start collapsed.
- Removed the settings panel fullscreen control.

### Fixed

- Closing nested popups with Escape leaves the settings panel open.

## 0.1.0

- Initial camera studio and video editor, including background replacement, effects, split camera, live text, and local MP4 recording/export.
