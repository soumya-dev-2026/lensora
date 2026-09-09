# Background Studio

A camera studio built with React, TypeScript, MediaPipe person segmentation, and WebGL 2. The person remains visible while the background is replaced or blurred. Processing stays on the device; the model and its runtime download on first use.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Camera access requires localhost or HTTPS, camera permission, and a browser with WebGL 2. Recording also requires canvas capture and MediaRecorder support.

## Use

1. Use the camera icon beside the red record button to preview, or the red button to start the camera and record once processing is ready. Icons have accessible names and hover labels.
2. The image icon at the top left opens the centered **Background** popup. Choose **Color**, **Blur** for the live room, or one of three image presets.
3. Selecting a preset shows its replacement upload and restore controls in the same popup. Images remain available in their respective slots for this session. Supported uploads: PNG, JPG, WebP, AVIF, up to 20 MB; large images are resized to fit within 2048 pixels.
4. Adjust background blur and darkening from 0–100% in the popup. Only the background is affected.
5. The orientation icon at the top right opens a popup for **Portrait (9:16)** or **Landscape (16:9)**. The full canvas stays visible without stretching. The fullscreen icon expands the studio, including its floating controls. Orientation is locked during recording.
6. Record with the red bottom-center button. **Pause/Resume** and **Stop** icons replace it. The centered timer appears only during recording, pause, and finalization; it excludes paused time.
7. Stop to open the video preview and filename dialog. **Save MP4** downloads an MP4 recording. Browsers without MP4 recording support show an error before capture begins. Closing the dialog keeps the clip available under **Review & save video**. **New recording** clears the previous clip, so save it first.

Recordings contain the composed canvas, without the floating controls, and are video-only (no microphone audio).

## Camera filters

The sparkle icon at the top left opens the centered **Camera filters** popup. All popups use translucent surfaces and blurred backdrops, and close with the close icon, Escape, or a click outside. They work during recording.

- **Beauty:** select an effect icon to adjust skin brightening, skin smoothness, larger eyes, red lips, or darker hair (0–100%). One labeled slider is shown at a time. Skin and hair effects use their segmentation categories. Smoothing preserves strong edges; lipstick follows the lip contours and excludes the mouth opening.
- **Light & color:** brightness, white balance (cool to warm), saturation, and contrast (-100 to +100). These apply to the camera image, including the live room in Blur & tint mode. Replacement images and solid backgrounds retain their original colors.
- **Enable filters** toggles a before/after comparison without losing slider settings. **Reset all filters** returns every control to neutral. All effects start at zero and apply to both preview and saved MP4.

Eye and lip effects track one face at a time using [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js). Tracking starts with the camera, including when beauty filters are off, to protect the eye/glasses region from transparent holes. Protection is clipped to the face outline and clears immediately when tracking loses the face. If tracking cannot load, segmentation and other controls remain usable; restart the camera to retry. Low light, occlusion, rapid movement, and device speed affect tracking quality. Settings last for the current page session.

The SelfieMulticlass model keeps hair, face skin, body skin, and clothes. Accessory confidence is retained near face skin to preserve attached eyewear, while distant accessory objects remain excluded. The tracked eye region additionally preserves lenses misclassified as background and protects them from skin brightening and smoothing. Classification can still make mistakes around occlusions and objects touching the face. The models are computationally demanding, so frame rate depends on the device.

Frames use video-frame callbacks when available. Person, skin, and hair confidence use time-based adaptive smoothing: small fluctuations receive more smoothing; large changes follow the current frame promptly to limit motion trails. History resets after a capture gap, camera restart/switch, or dimension change. The shader blurs confidence at 1.35-output-pixel spacing before a wider 0.12–0.88 soft threshold. Beauty effects use conservative maximum strengths: a hue-preserving skin exposure lift, limited smoothing corrections, subtle eye enlargement, luminance-preserving lip tint, and hair darkening that retains shading. Artificial grain and edge desaturation are removed.

## Cloudflare deployment

The site is deployed with Cloudflare Workers static assets at:
https://background-studio-soumya.video-background-replacement.workers.dev

`wrangler.jsonc` publishes `dist` and serves the app for client-side routes. To update it:

```sh
npm run build
npx wrangler@4 deploy
```

Run `npx wrangler@4 login` first if Cloudflare is not authenticated on the machine.

## Checks

```sh
npm test
npm run build
```

The regression tests cover confidence conversion and temporal smoothing, person/skin/hair category selection, history resets, callback mask ownership, MP4 format selection, closed lip/eye contours, filter bypass and face-loss behavior, image texture setup, orientation cropping, output-pixel edge blur spacing, blur/tint endpoints, and preset dimensions. They use a model fixture and a WebGL call recorder; they do not validate real model inference, GPU pixels, or actual browser encoding.

For a camera/browser check:

- Verify face, hair, body, and clothes remain visible over each preset and a solid color; check moving edges, held objects, nearby chairs, and a scene with no person.
- Upload different images into all three slots, then switch between them.
- Try blur and tint at 0, intermediate values, and 100 on the live room and an image.
- Check both orientations and fullscreen on desktop and mobile.
- Try each camera filter alone and in combination. Check moving/tilted faces, open mouth, tracking loss, bypass, reset, and filters in a saved MP4.
- Record, pause, resume, stop, rename, save, and play the downloaded video.
- Check camera permission denial and retry, image upload errors, and camera stop/restart.
