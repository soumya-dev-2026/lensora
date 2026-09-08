# Background Studio

A camera studio built with React, TypeScript, MediaPipe person segmentation, and WebGL 2. The person remains visible while the background is replaced or blurred. Processing stays on the device; the model and its runtime download on first use.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Camera access requires localhost or HTTPS, camera permission, and a browser with WebGL 2. Recording also requires canvas capture and MediaRecorder support.

## Use

1. Click **Start camera** to preview, or the large red **Record** button to start the camera and record once processing is ready.
2. Open **Background filters** at the top left. Choose a solid color, **Blur & tint** for the live room, or one of three image presets.
3. Clicking a preset selects it and opens its editor. Upload a replacement or restore the original. Images remain available in their respective slots for this session. Supported uploads: PNG, JPG, WebP, AVIF, up to 20 MB; large images are resized to fit within 2048 pixels.
4. Adjust blur and black tint from 0–100%. **Adjust current background** applies these settings to the current background without changing its source. Only the background is affected.
5. Choose **Portrait (9:16)** or **Landscape (16:9)** at the top right. The full canvas stays visible without stretching. The fullscreen button expands the studio, including its floating controls. Orientation is locked during recording.
6. Record with the red bottom-center button. Smaller **Pause/Resume** and **Stop** buttons replace it. The top-left timer excludes paused time.
7. Stop to open the video preview and filename dialog. **Save video** downloads WebM or MP4 according to browser support. Closing the dialog keeps the clip available under **Review & save video**. **New recording** clears the previous clip, so save it first.

Recordings contain the composed canvas, without the floating controls, and are video-only (no microphone audio).

## Checks

```sh
npm test
npm run build
```

The regression tests cover confidence-to-alpha conversion, callback mask ownership, image texture setup, orientation cropping, blur/tint endpoints, and preset dimensions. They use a model fixture and a WebGL call recorder; they do not validate real model inference or GPU pixels.

For a camera/browser check:

- Verify the person remains visible over each preset and a solid color; check hair and moving edges.
- Upload different images into all three slots, then switch between them.
- Try blur and tint at 0, intermediate values, and 100 on the live room and an image.
- Check both orientations and fullscreen on desktop and mobile.
- Record, pause, resume, stop, rename, save, and play the downloaded video.
- Check camera permission denial and retry, image upload errors, and camera stop/restart.
