# Background Studio - AI Real-Time Background Replacement Web App

## Phase 1: Camera MVP

This is the first phase of the Background Studio application. It provides:

- ✓ React + Vite + TypeScript setup
- ✓ Camera permission handling
- ✓ Front/rear camera switching
- ✓ Live camera preview
- ✓ Start/stop camera controls
- ✓ Error handling and user feedback
- ✓ Mobile browser support
- ✓ Responsive UI

## Project Structure

```
src/
├── camera/
│   └── CameraManager.ts          # Core camera logic (independent of React)
├── components/
│   ├── CameraPreview.tsx         # Video preview component
│   ├── CameraControls.tsx        # Camera controls component
│   ├── CameraPreview.module.css
│   └── CameraControls.module.css
├── hooks/
│   └── useCamera.ts              # React hook for camera integration
├── types/
│   └── camera.ts                 # TypeScript type definitions
├── App.tsx                        # Main application component
├── App.css
├── main.tsx                       # React entry point
└── index.css                      # Global styles
```

## Installation

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open your browser to the URL shown (typically `http://localhost:5173`)

## Usage

### Start Camera

Click the "▶ Start Camera" button to request camera access and begin the preview.

### Switch Camera

Once the camera is active, click "🔄 Switch" to toggle between front (user-facing) and rear cameras.

### Stop Camera

Click the "⏹ Stop Camera" button to stop the camera and release resources.

## Browser Support

The app works on modern browsers:

- Chrome/Chromium (Desktop & Android)
- Edge
- Firefox
- Safari

Requirements:

- HTTPS (or localhost for development)
- Camera hardware
- Modern browser with `navigator.mediaDevices.getUserMedia()` support

## Architecture

### CameraManager

The `CameraManager` class handles all camera operations independently of React:

- Permission requests
- Camera start/stop
- Front/rear switching
- Error handling
- Resource cleanup
- State notifications via listeners

### useCamera Hook

The `useCamera` hook bridges `CameraManager` and React:

- Manages `CameraManager` lifecycle
- Syncs `MediaStream` to video element
- Provides React state updates
- Cleans up resources on unmount

### Separation of Concerns

- **Camera Logic**: Lives in `CameraManager` (not tied to React render cycles)
- **React Integration**: Handled by `useCamera` hook
- **UI Components**: Receive data via props, remain pure and simple

## Next Phase

After verifying Phase 1 works reliably on Android Chrome and desktop browsers, proceed to Phase 2:

- Segmentation model abstraction
- MODNet implementation
- ONNX Runtime Web integration
- WebGPU support
- Web Worker integration

## Important Notes

- No camera data is uploaded anywhere
- All processing happens locally in the browser
- Resources are properly cleaned up on camera stop
- Mobile-first responsive design
- Accessibility features included

## Development

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```
