# CLAUDE.md

# AI Real-Time Background Replacement Web App

## 1. Project Overview

Build a production-oriented web application that uses the device camera to:

1. Access the user's front or rear camera.
2. Display the live camera feed.
3. Detect/segment the person in real time.
4. Generate an alpha mask for the person.
5. Remove the original background.
6. Replace it with:
   - Solid color
   - Image
   - Video
   - Blur
7. Display the processed result in real time.
8. Record the processed video, not the original camera feed.
9. Include microphone/audio recording.
10. Work primarily in modern desktop and Android mobile browsers.
11. Process the video locally in the browser whenever possible.

The application should be designed as a real product, not merely a proof-of-concept.

---

# 2. Core Technology Stack

Use the following technologies unless there is a strong technical reason to change them.

## Frontend

- React
- Vite
- TypeScript
- CSS Modules or well-organized CSS

## Camera

Use browser Web APIs:

```ts
navigator.mediaDevices.getUserMedia()

```

Support:

- Front camera
- Rear camera
- Camera switching
- Resolution selection where supported
- Frame-rate configuration where supported
- Microphone

## AI / Segmentation

The architecture must support interchangeable segmentation models.

Initial model:

- MODNet

Runtime:

- ONNX Runtime Web

Preferred execution provider:

- WebGPU

Fallback:

- WASM

Do NOT tightly couple the rest of the application to MODNet.

Create an abstraction layer so another model can be added later.

Potential future models:

- MediaPipe segmentation
- Other lightweight portrait segmentation models
- Device-specific models

---

# 3. High-Level Architecture

```text
                    React Application
                           │
              ┌────────────┴────────────┐
              │                         │
           UI Layer                Application State
              │                         │
              └────────────┬────────────┘
                           │
                           ▼
                    Camera Manager
                           │
                           ▼
                     Video Frames
                           │
                           ▼
                     Web Worker
                           │
                           ▼
                  Segmentation Model
                  ┌────────┴─────────┐
                  │                  │
               MODNet            Future Models
                  │                  │
                  └────────┬─────────┘
                           ▼
                      Alpha Mask
                           │
                           ▼
                  Mask Processing
                           │
                           ▼
                    GPU Compositor
                           │
                ┌──────────┴──────────┐
                │                     │
          Person foreground      Background
                                      │
                         ┌────────────┼────────────┐
                         │            │            │
                       Color        Image        Video
                                      │
                                      ▼
                               Final Composition
                                      │
                       ┌──────────────┴─────────────┐
                       │                            │
                    Preview                     Recording
                       │                            │
                       │                    canvas.captureStream()
                       │                            │
                       │                     MediaRecorder
                       │                            │
                       │                       WebM / MP4*
                       │
                       ▼
                    User

```

`*` Use the browser-supported MediaRecorder MIME type. Do not assume MP4 support.

---

# 4. Important Architectural Rule

React must NOT perform expensive frame-by-frame processing.

React should manage:

- UI
- Settings
- User interactions
- Camera configuration
- Background selection
- Recording state
- Model selection
- Application state

Do NOT run segmentation directly inside React render functions or normal React state updates.

Heavy processing belongs in:

- Web Workers
- WebGPU
- OffscreenCanvas where supported

---

# 5. Project Structure

Use this structure:

```text
src/
├── ai/
│   ├── BackgroundModel.ts
│   ├── ModnetModel.ts
│   ├── MediaPipeModel.ts
│   └── ModelManager.ts
│
├── camera/
│   ├── CameraManager.ts
│   └── FrameProcessor.ts
│
├── workers/
│   └── segmentation.worker.ts
│
├── rendering/
│   ├── Compositor.ts
│   ├── MaskProcessor.ts
│   └── BackgroundRenderer.ts
│
├── recording/
│   └── VideoRecorder.ts
│
├── components/
│   ├── CameraPreview.tsx
│   ├── CameraControls.tsx
│   ├── BackgroundPicker.tsx
│   ├── BackgroundPreview.tsx
│   ├── RecordButton.tsx
│   └── SettingsPanel.tsx
│
├── hooks/
│   ├── useCamera.ts
│   ├── useSegmentation.ts
│   └── useRecorder.ts
│
├── types/
│   ├── camera.ts
│   ├── segmentation.ts
│   └── recording.ts
│
├── utils/
│   ├── browserSupport.ts
│   ├── media.ts
│   └── performance.ts
│
├── App.tsx
├── main.tsx
└── index.css

```

---

# 6. AI Abstraction

Create a common interface.

Example:

```ts
export interface BackgroundModel {
  initialize(): Promise<void>;

  processFrame(
    frame: VideoFrame | ImageBitmap
  ): Promise<SegmentationResult>;

  dispose(): void;
}

```

Result:

```ts
export interface SegmentationResult {
  mask: ImageBitmap | GPUTexture;
  width: number;
  height: number;
}

```

The application should not know whether the implementation is:

```text
MODNet
MediaPipe
FutureModel

```

It should communicate through the common interface.

---

# 7. Model Manager

Create:

```text
ModelManager

```

Responsibilities:

- Detect browser capabilities.
- Detect WebGPU support.
- Select the best available model.
- Initialize the model.
- Handle model loading errors.
- Allow future model switching.
- Dispose models correctly.

Example flow:

```text
Application starts
        │
        ▼
Check WebGPU
        │
        ├── supported
        │       ↓
        │   Load preferred model
        │
        └── unsupported
                ↓
             WASM model

```

Do not silently fail.

Display a useful fallback message when required browser features are unavailable.

---

# 8. Camera Manager

Create a dedicated:

```ts
CameraManager

```

Responsibilities:

- Request camera permission.
- Start camera.
- Stop camera.
- Switch camera.
- Select front/rear camera.
- Handle camera errors.
- Handle device changes.
- Expose the active MediaStream.
- Configure resolution and frame rate.

Example:

```ts
interface CameraOptions {
  facingMode: "user" | "environment";
  width?: number;
  height?: number;
  frameRate?: number;
  audio?: boolean;
}

```

Default target:

```text
720p
30 FPS

```

Do not force 1080p on low-end devices.

---

# 9. Camera Resolution Strategy

Do not assume every device can process 1080p segmentation at 30 FPS.

Use adaptive processing.

Example:

```text
Camera:
1280 × 720

AI processing:
640 × 360

Composition:
1280 × 720

Recording:
1280 × 720

```

The segmentation model can operate at a lower resolution while the final composition remains higher resolution.

This is important for mobile performance.

---

# 10. Frame Processing

Do NOT run segmentation on every available camera frame by default.

Use an adaptive frame-processing strategy.

Example:

```text
Camera = 30 FPS

AI processing:
20–30 FPS depending on device performance

```

If inference becomes too slow:

```text
30 FPS camera
      ↓
AI processing 15 FPS
      ↓
interpolate/reuse latest mask
      ↓
30 FPS output

```

The system should avoid building a queue of stale frames.

Always prefer the latest frame.

---

# 11. Web Worker

Segmentation should run in:

```text
src/workers/segmentation.worker.ts

```

The worker should:

- Initialize model.
- Receive frames.
- Run inference.
- Return segmentation results.
- Handle errors.
- Dispose model.

Do not send unnecessary large objects between main thread and worker.

Use transferable objects where appropriate.

Potential APIs:

- ImageBitmap
- VideoFrame
- OffscreenCanvas
- Transferable ArrayBuffers

---

# 12. WebGPU

Use WebGPU when available.

WebGPU should be used for:

- Model inference where supported.
- Image resizing.
- Mask processing.
- Alpha compositing.
- Background rendering.
- Effects.

Do not manually process every pixel using JavaScript loops if GPU processing is practical.

Avoid code like:

```ts
for (let i = 0; i < pixels.length; i++) {
  // expensive pixel processing
}

```

for the main real-time processing pipeline.

---

# 13. Compositing

The final frame should conceptually be:

```text
Final =
    Person × Alpha
    +
    Background × (1 - Alpha)

```

Pipeline:

```text
Camera Frame
      │
      ▼
Person Mask
      │
      ▼
Mask Refinement
      │
      ▼
Alpha Composite
      │
      ├── Person
      │
      └── Background
              │
              ├── Solid
              ├── Image
              ├── Video
              └── Blur

```

---

# 14. Background Types

The application should support these background modes.

## Solid Color

Examples:

```text
#000000
#ffffff
#00ff00

```

Provide a color picker.

## Image

Allow users to:

- Upload image
- Select predefined image
- Preview image
- Replace image

Supported common formats:

- JPEG
- PNG
- WebP

## Video

Allow users to:

- Upload video
- Play background video
- Loop background
- Mute background audio by default

Do not automatically include background-video audio in the recording unless explicitly requested.

## Blur

Support:

```text
Original background
       ↓
Blur
       ↓
Person remains sharp

```

Allow adjustable blur intensity.

---

# 15. Mask Refinement

Raw segmentation masks may contain:

- Hair artifacts
- Flickering
- Jagged edges
- Holes
- Noise

Create:

```text
MaskProcessor.ts

```

Possible operations:

- Resize
- Blur
- Threshold
- Morphological cleanup
- Temporal smoothing
- Edge smoothing

Do not over-process the mask because excessive blur will destroy hair detail.

Provide configurable parameters.

---

# 16. Temporal Stability

The mask should not flicker heavily between frames.

Implement a lightweight temporal smoothing strategy.

Conceptually:

```text
Current Mask
     +
Previous Mask
     ↓
Temporal smoothing
     ↓
Stable Mask

```

The implementation must balance:

```text
smoothness
vs
latency

```

Do not introduce noticeable lag.

---

# 17. Preview

The preview should show the final processed video.

Do NOT show the original camera feed as the primary output once background replacement is active.

UI:

```text
┌─────────────────────────────┐
│                             │
│        FINAL PREVIEW        │
│                             │
│          PERSON             │
│                             │
│                             │
└─────────────────────────────┘

 [Flip] [Background] [Settings]

             ● Record

```

---

# 18. Recording

Use:

```ts
canvas.captureStream()

```

Then:

```ts
MediaRecorder

```

The recording pipeline should be:

```text
Camera
  ↓
Segmentation
  ↓
Compositor
  ↓
Canvas
  ↓
captureStream()
  ↓
MediaRecorder
  ↓
Recorded Video

```

Never record the raw camera stream when the user expects the background replacement.

---

# 19. Audio

Camera stream may contain:

```text
video track
audio track

```

The final recorded output should contain:

```text
Processed Video
      +
Microphone Audio
      ↓
MediaRecorder

```

Use Web Audio APIs if necessary to construct the final MediaStream.

Do not record audio twice.

---

# 20. Recording Formats

Detect supported MIME types:

```ts
MediaRecorder.isTypeSupported()

```

Possible candidates:

```text
video/webm;codecs=vp9,opus
video/webm;codecs=vp8,opus
video/mp4

```

Never assume a MIME type is supported.

Select the best supported format dynamically.

---

# 21. Recording Controls

Required controls:

```text
Start Recording
Stop Recording
Recording timer
Pause
Resume
Download
Delete

```

During recording:

```text
● REC 00:12

```

Prevent accidental navigation while recording if practical.

---

# 22. Privacy

The application should process camera data locally whenever possible.

Important rules:

- Do not upload camera frames to a server.
- Do not upload recordings automatically.
- Do not send user camera data to third-party AI APIs.
- Clearly explain camera permissions.
- Stop camera tracks when camera is disabled.
- Stop processing when leaving the recording screen.

Privacy should be a core product feature.

---

# 23. Browser Support

Primary targets:

```text
Chrome Android
Chrome Desktop
Edge
Safari
Firefox

```

However, capabilities differ.

Detect:

```ts
navigator.mediaDevices
navigator.gpu
MediaRecorder
HTMLCanvasElement.prototype.captureStream

```

Do not assume WebGPU exists.

Create capability detection:

```ts
interface BrowserCapabilities {
  camera: boolean;
  microphone: boolean;
  webGPU: boolean;
  mediaRecorder: boolean;
  canvasCapture: boolean;
  offscreenCanvas: boolean;
}

```

---

# 24. Mobile Optimization

Mobile performance is extremely important.

Target:

```text
720p output
24–30 FPS

```

Avoid:

- Excessive React renders
- Large state objects
- Copying image data unnecessarily
- CPU pixel loops
- Multiple simultaneous canvas copies
- Processing stale frames

Prefer:

- WebGPU
- Web Workers
- ImageBitmap
- VideoFrame
- OffscreenCanvas
- Reusable GPU resources
- Frame dropping

---

# 25. Memory Management

Be extremely careful with:

```text
ImageBitmap
VideoFrame
GPUTexture
GPUBuffer
MediaStream
MediaStreamTrack
ObjectURL

```

Dispose/release resources when no longer needed.

Examples:

```ts
imageBitmap.close();
videoFrame.close();
gpuTexture.destroy();
stream.getTracks().forEach(track => track.stop());
URL.revokeObjectURL(url);

```

Do not leak frames.

---

# 26. React State Rules

Do not store every video frame in React state.

Bad:

```ts
setFrame(currentFrame);

```

for every frame.

React state should contain application-level state such as:

```ts
cameraFacing
backgroundType
backgroundSource
isRecording
recordingDuration
selectedModel
processingFPS

```

Frame data belongs outside normal React state.

---

# 27. Performance Monitoring

Create a small performance monitor.

Track:

```text
Camera FPS
AI FPS
Output FPS
Inference time
Frame latency
Dropped frames
Memory usage where available

```

Development UI:

```text
Camera: 30 FPS
AI: 24 FPS
Output: 30 FPS
Inference: 32 ms
Dropped: 2%
Model: MODNet
GPU: WebGPU

```

Hide this in production or expose it through a developer/debug mode.

---

# 28. Adaptive Performance

The application should adapt to the device.

Example:

```text
High-end device
    ↓
720p AI
30 FPS

Medium device
    ↓
576p AI
24 FPS

Low-end device
    ↓
360p AI
15 FPS

```

The exact thresholds should be determined through benchmarking rather than arbitrary assumptions.

---

# 29. UI Requirements

The UI should be:

- Mobile-first
- Responsive
- Touch-friendly
- Simple
- Fast
- Minimal

Main screen:

```text
┌──────────────────────────────┐
│        Background Studio     │
│                              │
│   ┌──────────────────────┐   │
│   │                      │   │
│   │     VIDEO PREVIEW    │   │
│   │                      │   │
│   └──────────────────────┘   │
│                              │
│ Background                  │
│ [Color] [Image] [Video]     │
│ [Blur]                       │
│                              │
│      [ ● Record ]            │
│                              │
│ [Flip] [Camera] [Settings]  │
└──────────────────────────────┘

```

---

# 30. Background Picker

Create a reusable component:

```tsx
<BackgroundPicker
  type={backgroundType}
  onChange={setBackgroundType}
/>

```

Background categories:

```text
Color
Image
Video
Blur

```

Use previews.

---

# 31. Error Handling

Every important operation must have user-friendly error handling.

Examples:

### Camera denied

```text
Camera access was denied.
Please allow camera access in your browser settings.

```

### WebGPU unavailable

```text
GPU acceleration is unavailable.
The app will use a slower compatibility mode.

```

### Model failed

```text
The background removal model could not be loaded.
Please check your connection and try again.

```

### Recording unsupported

```text
Video recording is not supported by this browser.

```

Never expose raw stack traces to normal users.

---

# 32. Loading States

Model initialization can take time.

Show:

```text
Preparing background removal...
Loading AI model...
Initializing GPU...
Ready

```

Do not show a blank screen.

---

# 33. Model Loading

Do not bundle huge model files into the main JavaScript bundle.

Use lazy loading.

Conceptually:

```text
Application
   ↓
Load UI
   ↓
Camera available
   ↓
Load model
   ↓
Initialize runtime
   ↓
Start segmentation

```

Cache model assets where appropriate.

---

# 34. Development Phases

Do NOT implement the entire application at once.

## Phase 1 — Camera MVP

Implement:

- React + Vite + TypeScript
- Camera permission
- Front camera
- Rear camera
- Camera preview
- Start/stop camera

Success criteria:

```text
Camera works reliably on desktop and Android Chrome.

```

---

## Phase 2 — Segmentation

Implement:

- Model abstraction
- MODNet
- ONNX Runtime Web
- WebGPU where available
- WASM fallback
- Web Worker

Success criteria:

```text
Person is correctly segmented in real time.

```

---

## Phase 3 — Background Replacement

Implement:

- Alpha mask
- Solid color
- Image background
- Blur background

Success criteria:

```text
Live person appears over selected background.

```

---

## Phase 4 — Performance

Implement:

- WebGPU optimization
- Frame dropping
- Adaptive resolution
- Temporal smoothing
- Performance monitor

Target:

```text
24–30 FPS on capable Android devices.

```

---

## Phase 5 — Video Background

Implement:

- Video upload
- Video playback
- Looping
- Synchronization
- Background audio disabled by default

---

## Phase 6 — Recording

Implement:

- Canvas capture
- MediaRecorder
- Microphone
- Start/stop
- Pause/resume
- Timer
- Download
- MIME type detection

---

## Phase 7 — Production Polish

Implement:

- Error handling
- Permission UX
- Responsive UI
- Loading states
- Mobile optimization
- Memory cleanup
- Browser capability detection
- Accessibility

---

# 35. Testing

Test at minimum on:

## Desktop

- Chrome
- Edge
- Firefox
- Safari

## Android

Test multiple performance classes:

```text
Low-end Android
Mid-range Android
High-end Android

```

Important scenarios:

- Camera permission denied
- Camera switched
- Camera disconnected
- App backgrounded
- Screen locked
- Recording for several minutes
- Background changed while recording
- Model loading failure
- WebGPU unavailable
- Low memory
- Device rotation

---

# 36. Coding Rules

Use TypeScript strictly.

Avoid:

```ts
any

```

unless absolutely necessary.

Prefer:

```ts
unknown

```

with proper narrowing.

Use small, focused modules.

Avoid giant components.

Do not mix:

```text
camera logic
AI logic
rendering logic
recording logic

```

inside `App.tsx`.

---

# 37. Resource Cleanup

Every resource created by the application must have a cleanup path.

When stopping the application:

```text
Stop camera tracks
Stop background video
Stop recording
Terminate workers
Dispose AI model
Release GPU resources
Close VideoFrames
Close ImageBitmaps
Revoke object URLs

```

React cleanup should be used for lifecycle management where appropriate.

---

# 38. Git Workflow

Make small commits.

Recommended commit structure:

```text
feat: add camera manager
feat: add camera preview
feat: add segmentation model interface
feat: add MODNet inference
feat: add worker processing
feat: add background compositor
feat: add image backgrounds
feat: add video backgrounds
feat: add recording
perf: optimize frame processing
perf: add adaptive resolution
fix: release video frames
fix: handle camera permissions

```

Do not mix unrelated changes into one commit.

---

# 39. Definition of Done

The project is considered MVP-complete when:

- Camera works on Android Chrome.
- Camera can be switched.
- Person is segmented locally.
- Background can be replaced with an image.
- Background can be blurred.
- Processing is sufficiently real-time.
- UI remains responsive.
- Recording captures the processed output.
- Microphone audio is included.
- Recorded video can be downloaded.
- Camera and AI resources are properly released.
- No camera frames are uploaded to a backend.
- Application handles unsupported browser features gracefully.

---

# 40. Important Development Principle

Do not prematurely optimize everything.

Build in this order:

```text
Camera
   ↓
Segmentation
   ↓
Background replacement
   ↓
Recording
   ↓
Performance
   ↓
Production polish

```

At every phase:

1. Build the smallest working implementation.
2. Test it.
3. Measure performance.
4. Fix problems.
5. Move to the next phase.

Do not implement future phases before the current phase works.

---

# 41. Claude Instructions

When working on this project:

1. Read this `CLAUDE.md` before making architectural decisions.
2. Follow the existing architecture.
3. Do not introduce a backend unless explicitly requested.
4. Do not send camera frames to external services.
5. Prefer local browser processing.
6. Keep React separate from real-time frame processing.
7. Use Web Workers for heavy AI processing.
8. Prefer WebGPU when available.
9. Provide WASM/CPU fallback where practical.
10. Never assume WebGPU is available.
11. Never assume MediaRecorder supports a specific MIME type.
12. Never assume a device can process 1080p at 30 FPS.
13. Release all video/GPU/image resources.
14. Avoid unnecessary frame copies.
15. Avoid React state updates for every frame.
16. Use TypeScript.
17. Keep modules small and testable.
18. Do not add dependencies without explaining why they are necessary.
19. Before adding a library, check whether a browser-native API already solves the problem.
20. Prioritize Android Chrome performance because mobile is a primary target.

---

# 42. First Task

When beginning development, do NOT implement AI yet.

Start with:

```text
Phase 1

```

Create a clean React + Vite + TypeScript application with:

```text
CameraManager
useCamera
CameraPreview
CameraControls

```

Requirements:

- Request camera permission.
- Start front camera.
- Stop camera.
- Switch between front and rear camera.
- Show the camera preview.
- Handle permission errors.
- Clean up MediaStream tracks.
- Support mobile browsers.
- Keep camera logic separate from React UI.

After Phase 1 is working, stop and verify the implementation before proceeding to Phase 2.

Do not implement segmentation, WebGPU, recording, or background replacement until the camera foundation is stable.