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
3. Selecting a preset shows its replacement upload and restore controls in the same popup. Use the save icon after uploading to store a preset on this device. Saved presets reload from browser storage on future visits; restoring the original removes the saved override. Clearing site data removes saved presets. Supported uploads: PNG, JPG, WebP, AVIF, up to 20 MB; large images are resized to fit within 2048 pixels.
4. Adjust background blur and darkening from 0–100% in the popup. Only the background is affected.
5. The orientation icon at the top right opens a popup for **Portrait (9:16)** or **Landscape (16:9)**. The full canvas stays visible without stretching. The fullscreen icon expands the studio, including its floating controls. Orientation is locked during recording.
6. Record with the red bottom-center button. **Pause/Resume** and **Stop** icons replace it. The centered timer appears only during recording, pause, and finalization; it excludes paused time.
7. Stop to open the video preview and filename dialog. **Save MP4** downloads an MP4 recording. Browsers without MP4 recording support show an error before capture begins. Closing the dialog opens a delete confirmation. Cancel (or Escape) returns to the save dialog; **OK, delete** discards the clip and restarts the camera. **New recording** uses the same confirmation. The download icon saves the MP4.

Recordings contain the composed canvas without the floating controls. The microphone starts unmuted when the camera starts, after browser permission is granted. If permission is denied or no microphone is available, recording continues muted with a message. Use the microphone icon to mute or unmute before or during recording; mute stops microphone capture while preserving the recording. No live microphone audio is played through the speakers. Stopping the camera releases the microphone. Stopping a recording keeps your selected microphone state while the camera remains active.

## Split camera

Start the camera, open any studio settings popup, and enable **Studio preferences → Split camera**. The app opens a second available camera: landscape and square canvases show the feeds side by side; portrait stacks them. Both feeds are included in the recording. Backgrounds, filters, and effects apply to the main camera; the second feed stays unprocessed. Turn split mode off to return to one camera or switch front/rear cameras. Split mode cannot be changed during recording.

Two simultaneous cameras require device and browser support. If the second camera cannot open, the app shows a message. If opening it interrupts the main camera, start the camera again to return to single-camera mode. Stopping the camera or leaving the studio releases both streams.

## Camera filters

The sparkle icon at the top left opens the centered **Camera filters** popup. All popups use translucent surfaces and blurred backdrops, and close with the close icon, Escape, or a click outside. They work during recording.

- **Beauty:** select an effect icon to adjust skin brightening, skin smoothness, larger eyes, red lips, or darker hair (0–100%). One labeled slider is shown at a time. Skin and hair effects use their segmentation categories. Smoothing preserves strong edges; lipstick follows the lip contours and excludes the mouth opening.
- **Light & color:** brightness, white balance (cool to warm), saturation, and contrast (-100 to +100). These apply to the camera image, including the live room in Blur & tint mode. Replacement images and solid backgrounds retain their original colors.
- **Enable filters** toggles a before/after comparison without losing slider settings. **Reset all filters** returns every control to neutral. All effects start at zero and apply to both preview and saved MP4.

Eye and lip effects track one face at a time using [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js). Tracking starts with the camera, including when beauty filters are off, to protect the eye/glasses region from transparent holes. Protection is clipped to the face outline and clears immediately when tracking loses the face. If tracking cannot load, segmentation and other controls remain usable; restart the camera to retry. Low light, occlusion, rapid movement, and device speed affect tracking quality. Settings last for the current page session.

The SelfieMulticlass model keeps hair, face skin, body skin, and clothes. Accessory confidence is retained near face skin to preserve attached eyewear, while distant accessory objects remain excluded. The tracked eye region additionally preserves lenses misclassified as background and protects them from skin brightening and smoothing. Classification can still make mistakes around occlusions and objects touching the face. The models are computationally demanding, so frame rate depends on the device.

Frames use video-frame callbacks when available. Person, skin, and hair confidence use time-based adaptive smoothing: small fluctuations receive more smoothing; large changes follow the current frame promptly to limit motion trails. History resets after a capture gap, camera restart/switch, or dimension change. The shader blurs confidence at 1.35-output-pixel spacing before a wider 0.12–0.88 soft threshold. Beauty effects use conservative maximum strengths: a hue-preserving skin exposure lift, limited smoothing corrections, subtle eye enlargement, luminance-preserving lip tint, and hair darkening that retains shading. Artificial grain and edge desaturation are removed.

Segmentation input is capped at 384 pixels on its longest side, preserving the camera aspect ratio. The preview and MP4 still use the original camera image at the selected output resolution. Mask processing reuses scratch buffers, uses a linear-time neighborhood filter, and looks up temporal weights instead of computing an exponent for every pixel. Camera mipmaps are generated only for live-background blur. In an isolated synthetic browser benchmark on the development machine, median segmentation processing fell from approximately 537 ms to 134 ms per frame; actual camera frame rate depends on hardware, lighting, and the browser. Inference still runs synchronously on the main thread.

## Video editor

Open the edit icon in the studio, or visit `/editor` directly. The editor is a separate page and accepts locally uploaded videos that the browser can decode. Files are processed on the device and are not uploaded to a server.

- **Trim:** select the start/end in seconds; preview and export use this range.
- **Crop:** use original, 16:9, 9:16, or square presets, then adjust position and size.
- **Audio:** mute/unmute the original video; upload multiple audio tracks, each with its own 0–100% volume and start time on the original video timeline. Tracks play once and stop at their own end. Trimming preserves their alignment.
- **Overlays:** add text, PNG/JPG/WebP/AVIF images, and emoji. Select a layer, drag it on the preview, or adjust its position/size. Text supports color and multiple lines. Layers can be removed or brought to the front and appear throughout the selected clip.
- **Frames:** choose a border, cinema bars, or a polaroid frame with adjustable color and thickness.
- **Export:** the download icon renders the edit to MP4, then opens a video preview and filename field. Use the save icon to download it. Output is up to 1920 pixels on the longest edge, with a 30 fps canvas capture. Keep the page visible; export takes approximately the selected clip duration. Hiding the page cancels export to avoid incomplete output. MP4/AAC recording support is required; unsupported formats produce a readable error.

Editor projects are held in memory. Download your result before leaving or reloading the editor. The studio and editor links navigate between separate pages; recorded clips can be saved and then uploaded into the editor.

## Cloudflare deployment

The site is deployed with Cloudflare Workers static assets at:
https://background-studio-soumya.video-background-replacement.workers.dev

`wrangler.jsonc` publishes `dist` and serves the app for client-side routes. To update it:

```sh
npm run deploy
```

Run `npm run cloudflare:login` first if Cloudflare is not authenticated on the machine. The deploy command builds the app before publishing it to the existing Cloudflare Worker. Local Cloudflare state is kept in the ignored `.wrangler` directory.

## Checks

```sh
npm test
npm run build
```

The regression tests cover confidence conversion and temporal smoothing, person/skin/hair category selection, history resets, callback mask ownership, MP4 format selection, closed lip/eye contours, filter bypass and face-loss behavior, image texture setup, orientation cropping, output-pixel edge blur spacing, blur/tint endpoints, and preset dimensions. Editor regressions cover crop bounds, output sizing, overlay/frame rendering, audio timing and independent gain, trim/export completion, cancellation, and capture-track cleanup. They use media/model fixtures and rendering call recorders; they do not validate real model inference, GPU pixels, or actual browser encoding.

For a camera/browser check:

- Verify face, hair, body, and clothes remain visible over each preset and a solid color; check moving edges, held objects, nearby chairs, and a scene with no person.
- Upload different images into all three slots, then switch between them.
- Try blur and tint at 0, intermediate values, and 100 on the live room and an image.
- Check both orientations and fullscreen on desktop and mobile.
- Try each camera filter alone and in combination. Check moving/tilted faces, open mouth, tracking loss, bypass, reset, and filters in a saved MP4.
- Record, toggle microphone mute/unmute, pause, resume, stop, rename, save, and play the downloaded video. Check microphone denial and audio playback.
- Close the save dialog using its close icon, Escape, and backdrop; cancel to recover the same clip, or delete to restart the camera.
- Upload and save a background, reload, select it again, then restore the original and reload.
- Check camera permission denial and retry, image upload errors, and camera stop/restart.
