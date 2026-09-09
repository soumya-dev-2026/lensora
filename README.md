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
7. Stop to open the video preview and filename dialog. **Save MP4** downloads an MP4 recording. Browsers without MP4 recording support show an error before capture begins. Closing the dialog keeps the clip available under **Review & save video**. **New recording** clears the previous clip, so save it first.

Recordings contain the composed canvas, without the floating controls, and are video-only (no microphone audio).

The SelfieMulticlass model keeps hair, face skin, body skin, and clothes. Background and the model's "others" category (including accessories) are excluded. Classification can still make mistakes around objects touching a person; accessories such as glasses may also be removed. This model is more computationally demanding than the binary selfie model, so frame rate depends on the device.

The combined person confidence is blended once per video frame (70% current, 30% previous smoothed confidence) before uploading to WebGL. The shader applies a 0.35–0.65 soft threshold followed by a small Gaussian blur with one-output-pixel sample spacing. History resets when the camera restarts, switches, or the mask dimensions change.

## Checks

```sh
npm test
npm run build
```

The regression tests cover confidence conversion and temporal smoothing, history resets, callback mask ownership, MP4 format selection, image texture setup, orientation cropping, output-pixel edge blur spacing, blur/tint endpoints, and preset dimensions. They use a model fixture and a WebGL call recorder; they do not validate real model inference, GPU pixels, or actual browser encoding.

For a camera/browser check:

- Verify face, hair, body, and clothes remain visible over each preset and a solid color; check moving edges, held objects, nearby chairs, and a scene with no person.
- Upload different images into all three slots, then switch between them.
- Try blur and tint at 0, intermediate values, and 100 on the live room and an image.
- Check both orientations and fullscreen on desktop and mobile.
- Record, pause, resume, stop, rename, save, and play the downloaded video.
- Check camera permission denial and retry, image upload errors, and camera stop/restart.
