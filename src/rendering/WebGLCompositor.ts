import type { CameraFilters, FaceFeatures } from '../types/filters';

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_camera;
uniform sampler2D u_mask;
uniform sampler2D u_background;
uniform sampler2D u_regions;
uniform sampler2D u_faceMask;
uniform vec2 u_cameraTexel;
uniform vec4 u_eye0;
uniform vec4 u_eye1;
uniform float u_brightness;
uniform float u_whiteBalance;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_skinBrightening;
uniform float u_skinSmoothing;
uniform float u_eyeSize;
uniform float u_redLips;
uniform float u_darkHair;
uniform bool u_mirror;
uniform vec2 u_cameraScale;
uniform vec2 u_backgroundScale;
uniform vec2 u_maskPixel;
uniform vec2 u_backgroundTexel;
uniform float u_blur;
uniform float u_tint;
uniform bool u_liveBackground;
in vec2 v_uv;
out vec4 outColor;

vec3 cameraColor(vec3 color) {
  color *= exp2(u_brightness * 1.3);
  color *= vec3(1.0 + u_whiteBalance * 0.18, 1.0 - abs(u_whiteBalance) * 0.03, 1.0 - u_whiteBalance * 0.18);
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, 1.0 + u_saturation);
  color = (color - 0.5) * (1.0 + u_contrast * 0.8) + 0.5;
  return clamp(color, 0.0, 1.0);
}

vec2 enlargeEye(vec2 uv, vec4 eye) {
  if (u_eyeSize <= 0.0 || eye.z <= 0.0) return uv;
  vec2 relative = (uv - eye.xy) / eye.zw;
  float radius = length(relative);
  float falloff = 1.0 - smoothstep(0.0, 1.0, radius);
  return eye.xy + (uv - eye.xy) * (1.0 - u_eyeSize * 0.07 * falloff);
}

vec3 beautify(vec2 uv) {
  vec3 color = texture(u_camera, uv).rgb;
  vec2 regions = texture(u_regions, uv).rg;
  vec3 face = texture(u_faceMask, uv).rgb;
  float skin = smoothstep(0.2, 0.85, regions.r);
  float hair = smoothstep(0.2, 0.85, regions.g);
  float protectedDetail = clamp(face.r + face.g + face.b, 0.0, 1.0);
  float skinAmount = skin * (1.0 - protectedDetail);
  if (u_skinSmoothing > 0.0 && skinAmount > 0.01) {
    // Bilateral filtering preserves strong edges instead of blurring the face.
    vec3 sum = vec3(0.0);
    float total = 0.0;
    vec2 stepSize = u_cameraTexel * max(1.0, 1.3 / (u_cameraTexel.y * 720.0));
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 sampleUv = uv + offset * stepSize;
        vec3 sampleColor = texture(u_camera, sampleUv).rgb;
        vec3 delta = sampleColor - color;
        float weight = exp(-dot(offset, offset) / 4.0 - dot(delta, delta) / 0.008);
        weight *= smoothstep(0.35, 0.8, texture(u_regions, sampleUv).r);
        sum += sampleColor * weight;
        total += weight;
      }
    }
    // Retain skin texture and freckles: limit both correction and blend amount.
    vec3 correction = clamp(sum / max(total, 0.0001) - color, vec3(-0.035), vec3(0.035));
    color += correction * u_skinSmoothing * skinAmount * 0.5;
  }
  float skinLight = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float highlightProtection = 1.0 - smoothstep(0.55, 0.95, skinLight);
  // A small exposure lift preserves skin hue instead of mixing in white.
  color *= 1.0 + 0.14 * u_skinBrightening * skinAmount * highlightProtection;
  // Darken hair while retaining its original shading and strands.
  color *= 1.0 - u_darkHair * hair * 0.3;
  float lipLight = dot(color, vec3(0.299, 0.587, 0.114));
  // Shift the existing lip color gently; preserve its luminance and highlights.
  vec3 lipstick = color * vec3(1.16, 0.86, 0.93);
  lipstick *= lipLight / max(dot(lipstick, vec3(0.299, 0.587, 0.114)), 0.001);
  color = mix(color, lipstick, face.r * u_redLips * 0.55);
  return cameraColor(color);
}

float personMask(vec2 uv) {
  // Filter confidence BEFORE thresholding so small changes cannot snap an edge.
  vec2 px = u_maskPixel * 1.35;
  float mask = texture(u_mask, uv).r * 0.25;
  mask += texture(u_mask, uv + vec2(px.x, 0.0)).r * 0.125;
  mask += texture(u_mask, uv - vec2(px.x, 0.0)).r * 0.125;
  mask += texture(u_mask, uv + vec2(0.0, px.y)).r * 0.125;
  mask += texture(u_mask, uv - vec2(0.0, px.y)).r * 0.125;
  mask += texture(u_mask, uv + px).r * 0.0625;
  mask += texture(u_mask, uv - px).r * 0.0625;
  mask += texture(u_mask, uv + vec2(px.x, -px.y)).r * 0.0625;
  mask += texture(u_mask, uv + vec2(-px.x, px.y)).r * 0.0625;
  return smoothstep(0.12, 0.88, mask);
}

vec3 backgroundSample(vec2 uv) {
// Prefilter wide samples through mip levels to avoid ghosted copies at high blur.
  float level = log2(max(1.0, u_blur * 48.0));
  if (u_liveBackground) return cameraColor(textureLod(u_camera, uv, level).rgb);
  return textureLod(u_background, uv, level).rgb;
}

vec3 blurredBackground(vec2 uv) {
  if (u_blur <= 0.0) return backgroundSample(uv);
  vec2 px = u_backgroundTexel * u_blur * 48.0;
  vec3 color = vec3(0.0);
  float total = 0.0;
  for (int y = -3; y <= 3; y++) {
    for (int x = -3; x <= 3; x++) {
      vec2 offset = vec2(float(x), float(y));
      float weight = exp(-dot(offset, offset) / 4.0);
      color += backgroundSample(uv + offset * px) * weight;
      total += weight;
    }
  }
  return color / total;
}

void main() {
  vec2 cameraUv = (v_uv - 0.5) * u_cameraScale + 0.5;
  if (u_mirror) cameraUv.x = 1.0 - cameraUv.x;
  vec2 beautyUv = enlargeEye(enlargeEye(cameraUv, u_eye0), u_eye1);
  vec3 foreground = beautify(beautyUv);
  vec2 backgroundUv = u_liveBackground ? cameraUv : (v_uv - 0.5) * u_backgroundScale + 0.5;
  vec3 background = blurredBackground(backgroundUv) * (1.0 - u_tint);
  // Eye enlargement must not move the person's silhouette or glasses coverage.
  float alpha = max(personMask(cameraUv), texture(u_faceMask, cameraUv).b);
  outColor = vec4(mix(background, foreground, alpha), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed.');
  }
  return shader;
}

export class WebGLCompositor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private cameraTexture: WebGLTexture;
  private maskTexture: WebGLTexture;
  private backgroundTexture: WebGLTexture;
  private regionsTexture: WebGLTexture;
  private faceTexture: WebGLTexture;
  private filterLocations: Map<string, WebGLUniformLocation | null>;
  private backgroundAspect = 1;
  private backgroundWidth = 1;
  private backgroundHeight = 1;
  private buffer: WebGLBuffer | null = null;
  private blurLocation: WebGLUniformLocation | null;
  private tintLocation: WebGLUniformLocation | null;
  private liveBackgroundLocation: WebGLUniformLocation | null;
  private cameraScaleLocation: WebGLUniformLocation | null;
  private backgroundScaleLocation: WebGLUniformLocation | null;
  private mirrorLocation: WebGLUniformLocation | null;
  private maskPixelLocation: WebGLUniformLocation | null;
  private backgroundTexelLocation: WebGLUniformLocation | null;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL 2 is required for background replacement.');
    this.gl = gl;

    const program = gl.createProgram();
    if (!program) throw new Error('Unable to create WebGL program.');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed.');
    }
    this.program = program;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.cameraTexture = this.createTexture(0, 'u_camera');
    this.maskTexture = this.createTexture(1, 'u_mask');
    this.backgroundTexture = this.createTexture(2, 'u_background');
    this.regionsTexture = this.createTexture(3, 'u_regions');
    this.faceTexture = this.createTexture(4, 'u_faceMask');
    this.filterLocations = new Map([
      'brightness', 'whiteBalance', 'saturation', 'contrast', 'skinBrightening',
      'skinSmoothing', 'eyeSize', 'redLips', 'darkHair', 'cameraTexel', 'eye0', 'eye1',
    ].map((key) => [key, gl.getUniformLocation(program, `u_${key}`)]));
    this.cameraScaleLocation = gl.getUniformLocation(program, 'u_cameraScale');
    this.backgroundScaleLocation = gl.getUniformLocation(program, 'u_backgroundScale');
    this.mirrorLocation = gl.getUniformLocation(program, 'u_mirror');
    this.maskPixelLocation = gl.getUniformLocation(program, 'u_maskPixel');
    this.backgroundTexelLocation = gl.getUniformLocation(program, 'u_backgroundTexel');
    this.blurLocation = gl.getUniformLocation(program, 'u_blur');
    this.tintLocation = gl.getUniformLocation(program, 'u_tint');
    this.liveBackgroundLocation = gl.getUniformLocation(program, 'u_liveBackground');
    this.setBackgroundColor('#263246');
  }

  private createTexture(unit: number, uniform: string): WebGLTexture {
    const { gl, program } = this;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Unable to create WebGL texture.');
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, uniform === 'u_camera' || uniform === 'u_background' ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, uniform), unit);
    return texture;
  }

  setBackground(image: HTMLImageElement): void {
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('The background image has no dimensions.');
    this.backgroundWidth = image.naturalWidth;
    this.backgroundHeight = image.naturalHeight;
    this.backgroundAspect = image.naturalWidth / image.naturalHeight;
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform2f(this.backgroundTexelLocation, 1 / image.naturalWidth, 1 / image.naturalHeight);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  setBackgroundColor(hex: string): void {
    this.backgroundAspect = 1;
    this.backgroundWidth = 1;
    this.backgroundHeight = 1;
    const value = hex.replace('#', '');
    const normalized = value.length === 3
      ? value.split('').map((character) => character + character).join('')
      : value;
    const rgb = [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([rgb[0] || 0, rgb[1] || 0, rgb[2] || 0, 255]),
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.uniform2f(this.backgroundTexelLocation, 1, 1);
  }

  dispose(): void {
    const { gl } = this;
    gl.deleteTexture(this.cameraTexture);
    gl.deleteTexture(this.maskTexture);
    gl.deleteTexture(this.backgroundTexture);
    gl.deleteTexture(this.regionsTexture);
    gl.deleteTexture(this.faceTexture);
    gl.deleteBuffer(this.buffer);
    for (const shader of gl.getAttachedShaders(this.program) || []) gl.deleteShader(shader);
    gl.deleteProgram(this.program);
  }

  render(video: HTMLVideoElement | HTMLCanvasElement, mask: Uint8Array, maskWidth: number, maskHeight: number, mirror: boolean, liveBackground = false, blur = 0, tint = 0, filters?: CameraFilters, regions?: Uint8Array, face?: FaceFeatures | null): void {
    const sourceWidth = 'videoWidth' in video ? video.videoWidth : video.width;
    const sourceHeight = 'videoHeight' in video ? video.videoHeight : video.height;
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    for (const key of ['brightness', 'whiteBalance', 'saturation', 'contrast', 'skinBrightening', 'skinSmoothing', 'eyeSize', 'redLips', 'darkHair'] as const) {
      const needsFace = key === 'eyeSize' || key === 'redLips';
      gl.uniform1f(this.filterLocations.get(key)!, filters?.enabled && (!needsFace || face) ? filters[key] / 100 : 0);
    }
    gl.uniform2f(this.filterLocations.get('cameraTexel')!, 1 / sourceWidth, 1 / sourceHeight);
    for (let i = 0; i < 2; i++) {
      const eye = face?.eyes[i] ?? [0, 0, 0, 0];
      gl.uniform4f(this.filterLocations.get(`eye${i}`)!, eye[0], eye[1], eye[2], eye[3]);
    }
    gl.uniform1f(this.blurLocation, blur / 100);
    gl.uniform1f(this.tintLocation, tint / 100);
    gl.uniform1i(this.liveBackgroundLocation, liveBackground ? 1 : 0);
    gl.uniform2f(this.backgroundTexelLocation, 1 / (liveBackground ? sourceWidth : this.backgroundWidth), 1 / (liveBackground ? sourceHeight : this.backgroundHeight));
    // Center-crop both sources to fill the output without stretching.
    const outputAspect = this.canvas.width / this.canvas.height;
    const cameraAspect = sourceWidth / sourceHeight;
    gl.uniform2f(this.cameraScaleLocation, Math.min(1, outputAspect / cameraAspect), Math.min(1, cameraAspect / outputAspect));
    gl.uniform2f(this.backgroundScaleLocation, Math.min(1, outputAspect / this.backgroundAspect), Math.min(1, this.backgroundAspect / outputAspect));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cameraTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    // Camera mip levels are only sampled when blurring the live room.
    const cameraMipmaps = liveBackground && blur > 0;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, cameraMipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    if (cameraMipmaps) gl.generateMipmap(gl.TEXTURE_2D);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, maskWidth, maskHeight, 0, gl.RED, gl.UNSIGNED_BYTE, mask);
    gl.uniform2f(this.maskPixelLocation,
      Math.min(1, outputAspect / cameraAspect) / this.canvas.width,
      Math.min(1, cameraAspect / outputAspect) / this.canvas.height);
    gl.uniform1i(this.mirrorLocation, mirror ? 1 : 0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.regionsTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, regions ? maskWidth : 1, regions ? maskHeight : 1, 0, gl.RG, gl.UNSIGNED_BYTE, regions ?? new Uint8Array(2));
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.faceTexture);
    if (face) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face.mask);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
