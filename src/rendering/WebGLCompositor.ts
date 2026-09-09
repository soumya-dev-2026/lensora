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

float thresholdMask(vec2 uv) {
  // The uploaded confidence already includes temporal smoothing.
  return smoothstep(0.35, 0.65, texture(u_mask, uv).r);
}

float personMask(vec2 uv) {
  // Small Gaussian edge blur in OUTPUT pixels, not low-resolution mask texels.
  vec2 px = u_maskPixel;
  float mask = thresholdMask(uv) * 0.25;
  mask += thresholdMask(uv + vec2(px.x, 0.0)) * 0.125;
  mask += thresholdMask(uv - vec2(px.x, 0.0)) * 0.125;
  mask += thresholdMask(uv + vec2(0.0, px.y)) * 0.125;
  mask += thresholdMask(uv - vec2(0.0, px.y)) * 0.125;
  mask += thresholdMask(uv + px) * 0.0625;
  mask += thresholdMask(uv - px) * 0.0625;
  mask += thresholdMask(uv + vec2(px.x, -px.y)) * 0.0625;
  mask += thresholdMask(uv + vec2(-px.x, px.y)) * 0.0625;
  return mask;
}

vec3 backgroundSample(vec2 uv) {
// Prefilter wide samples through mip levels to avoid ghosted copies at high blur.
  float level = log2(max(1.0, u_blur * 48.0));
  if (u_liveBackground) return textureLod(u_camera, uv, level).rgb;
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

float noise(vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 cameraUv = (v_uv - 0.5) * u_cameraScale + 0.5;
  if (u_mirror) cameraUv.x = 1.0 - cameraUv.x;
  vec4 foreground = texture(u_camera, cameraUv);
  vec2 backgroundUv = u_liveBackground ? cameraUv : (v_uv - 0.5) * u_backgroundScale + 0.5;
  vec3 background = blurredBackground(backgroundUv) * (1.0 - u_tint);
  float alpha = personMask(cameraUv);

  // Pull a little background light into only the soft boundary pixels.
  float boundary = 1.0 - abs(alpha * 2.0 - 1.0);
  boundary *= step(0.02, alpha) * step(alpha, 0.98);
  vec3 lightWrappedForeground = mix(foreground.rgb, background, boundary * 0.10);

  // Slightly reduce saturated color contamination at uncertain edges.
  float luminance = dot(lightWrappedForeground, vec3(0.299, 0.587, 0.114));
  vec3 cleanForeground = mix(lightWrappedForeground, vec3(luminance), boundary * 0.07);
  vec3 composite = mix(background, cleanForeground, alpha);

  // Keep a little camera grain without changing a fully tinted background.
  float grain = (noise(gl_FragCoord.xy) - 0.5) * 0.012;
  outColor = vec4(composite + grain * alpha, 1.0);
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, uniform === 'u_mask' ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
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
    gl.deleteBuffer(this.buffer);
    for (const shader of gl.getAttachedShaders(this.program) || []) gl.deleteShader(shader);
    gl.deleteProgram(this.program);
  }

  render(video: HTMLVideoElement, mask: Uint8Array, maskWidth: number, maskHeight: number, mirror: boolean, liveBackground = false, blur = 0, tint = 0): void {
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.uniform1f(this.blurLocation, blur / 100);
    gl.uniform1f(this.tintLocation, tint / 100);
    gl.uniform1i(this.liveBackgroundLocation, liveBackground ? 1 : 0);
    gl.uniform2f(this.backgroundTexelLocation, 1 / (liveBackground ? video.videoWidth : this.backgroundWidth), 1 / (liveBackground ? video.videoHeight : this.backgroundHeight));
    // Center-crop both sources to fill the output without stretching.
    const outputAspect = this.canvas.width / this.canvas.height;
    const cameraAspect = video.videoWidth / video.videoHeight;
    gl.uniform2f(this.cameraScaleLocation, Math.min(1, outputAspect / cameraAspect), Math.min(1, cameraAspect / outputAspect));
    gl.uniform2f(this.backgroundScaleLocation, Math.min(1, outputAspect / this.backgroundAspect), Math.min(1, this.backgroundAspect / outputAspect));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cameraTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, maskWidth, maskHeight, 0, gl.RED, gl.UNSIGNED_BYTE, mask);
    gl.uniform2f(this.maskPixelLocation,
      Math.min(1, outputAspect / cameraAspect) / this.canvas.width,
      Math.min(1, cameraAspect / outputAspect) / this.canvas.height);
    gl.uniform1i(this.mirrorLocation, mirror ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
