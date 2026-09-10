import type { CameraEffects } from '../types/effects';
import type { CameraFilters, FaceFeatures } from '../types/filters';

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
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
uniform float u_sharpen;
uniform float u_look;
uniform float u_lookIntensity;
uniform float u_vignette;
uniform float u_outline;
uniform float u_outlineWidth;
uniform vec4 u_outlineColor;
uniform vec4 u_pose;
uniform float u_time;
uniform float u_sourceAspect;
uniform float u_outputAspect;
uniform float u_roll;
uniform float u_weather;
uniform float u_wave;
uniform float u_sticker;
uniform float u_frame;
uniform float u_spotlight;
uniform float u_distortion;
uniform float u_monochrome;
uniform float u_sepia;
uniform float u_grain;
uniform float u_glitch;
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
  if (u_sharpen > 0.0) {
    vec3 neighbors = (texture(u_camera, uv + vec2(u_cameraTexel.x, 0.0)).rgb + texture(u_camera, uv - vec2(u_cameraTexel.x, 0.0)).rgb
      + texture(u_camera, uv + vec2(0.0, u_cameraTexel.y)).rgb + texture(u_camera, uv - vec2(0.0, u_cameraTexel.y)).rgb) * 0.25;
    color = clamp(color + clamp(color - neighbors, -0.12, 0.12) * u_sharpen * 2.0, 0.0, 1.0);
  }
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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 4375.5453);
}

// Coordinates in face-height units, with head roll removed.
vec2 faceLocal(vec2 uv) {
  vec2 p = (uv - u_pose.xy) * vec2(u_sourceAspect, 1.0);
  float c = cos(u_roll), s = sin(u_roll);
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
}

vec3 animateBackground(vec3 color, vec2 uv) {
  vec2 p = uv * vec2(u_outputAspect, 1.0);
  if (u_weather == 1.0) {
    for (int i = 0; i < 18; i++) {
      float seed = float(i);
      float h = hash(vec2(seed, 4.0));
      float r = 0.018 + h * 0.047;
      vec2 center = vec2(hash(vec2(seed, 8.0)) * u_outputAspect + sin(u_time * 0.5 + seed) * 0.035,
        1.15 - mod(hash(vec2(seed, 9.0)) * 1.3 + u_time * (0.035 + h * 0.035), 1.3));
      vec2 q = (p - center) / r;
      float d = length(q);
      if (d < 1.08) {
        float rim = exp(-pow((d - 0.94) * 23.0, 2.0));
        float shine = exp(-dot(q - vec2(-0.35, -0.48), q - vec2(-0.35, -0.48)) * 65.0);
        vec3 iridescence = 0.55 + 0.45 * cos(vec3(0.0, 2.1, 4.2) + atan(q.y, q.x) * 2.0 + u_time * 0.4);
        color = mix(color, color * 0.92 + iridescence * 0.18, (1.0 - smoothstep(0.85, 1.0, d)) * 0.3);
        color += rim * iridescence * 0.38 + shine * 0.7;
      }
    }
  } else if (u_weather == 2.0) {
    for (int layer = 0; layer < 3; layer++) {
      float depth = float(layer);
      vec2 rain = vec2(p.x + p.y * 0.13, p.y) * vec2(65.0 + depth * 25.0, 8.0 + depth * 4.0);
      rain.y -= u_time * (7.0 + depth * 3.0);
      vec2 cell = floor(rain), q = fract(rain);
      float seed = hash(cell);
      float streak = (1.0 - smoothstep(0.015, 0.07, abs(q.x - (0.2 + seed * 0.6)))) * smoothstep(0.0, 0.9, q.y);
      color += vec3(0.6, 0.78, 0.95) * streak * step(0.55, seed) * (0.16 + depth * 0.08);
    }
  }
  return color;
}

vec3 faceDecoration(vec3 color, vec2 uv) {
  if (u_pose.z <= 0.0) return color;
  vec2 local = faceLocal(uv);
  vec2 radius = vec2(u_pose.z * u_sourceAspect, u_pose.w);
  vec2 q = local / radius;
  if (u_wave > 0.0) {
    float angle = atan(q.y, q.x);
    float edge = abs(length(q) - 1.13 - sin(angle * 12.0 + u_time * 3.0) * 0.055);
    vec3 neon = 0.55 + 0.45 * cos(vec3(0.0, 2.0, 4.0) + angle + u_time);
    color += neon * exp(-edge * 35.0) * 0.5;
    color = mix(color, neon, 1.0 - smoothstep(0.014, 0.035, edge));
  }
  if (u_sticker > 0.0) {
    vec2 s = (local - vec2(0.0, -radius.y * 1.35)) / (radius.x * 0.65);
    float shape = 0.0;
    vec3 ink = vec3(1.0, 0.78, 0.16);
    if (u_sticker == 1.0) {
      float top = -0.48 + 0.4 * abs(sin((s.x + 0.8) * 5.89));
      shape = (1.0 - smoothstep(0.78, 0.82, abs(s.x))) * smoothstep(top - 0.025, top, s.y) * (1.0 - smoothstep(0.35, 0.39, s.y));
      ink += vec3(0.0, 0.12, 0.25) * (1.0 - smoothstep(0.0, 0.12, abs(s.y - 0.2)));
    } else if (u_sticker == 2.0) {
      vec2 h = s * 1.35; h.y = -h.y + 0.15;
      float base = h.x * h.x + h.y * h.y - 0.65;
      float heart = base * base * base - h.x * h.x * h.y * h.y * h.y;
      shape = 1.0 - smoothstep(-0.025, 0.025, heart);
      ink = vec3(1.0, 0.18, 0.4);
    } else {
      float angle = mod(atan(s.x, -s.y) + 6.283185, 6.283185);
      float sector = floor(angle / 0.6283185);
      float localAngle = angle - sector * 0.6283185;
      float outer = mod(sector, 2.0) < 1.0 ? 0.8 : 0.35;
      float inner = mod(sector, 2.0) < 1.0 ? 0.35 : 0.8;
      float boundary = outer * inner * sin(0.6283185) / (inner * sin(0.6283185 - localAngle) + outer * sin(localAngle));
      shape = 1.0 - smoothstep(boundary - 0.02, boundary + 0.02, length(s));
    }
    color = mix(color, ink * (0.9 + 0.1 * clamp(-s.y, 0.0, 1.0)), shape);
  }
  return color;
}

vec3 finishEffects(vec3 color, vec2 uv, vec2 cameraUv) {
  if (u_spotlight > 0.0) {
    vec2 center = vec2(0.5, 0.42);
    if (u_pose.z > 0.0) {
      center = u_pose.xy;
      if (u_mirror) center.x = 1.0 - center.x;
      center = (center - 0.5) / u_cameraScale + 0.5;
    }
    float distance = length((uv - center) * vec2(u_outputAspect, 1.0));
    color *= 1.0 - smoothstep(0.16, 0.6, distance) * u_spotlight * 0.88;
    color += vec3(1.0, 0.91, 0.7) * exp(-distance * distance * 28.0) * u_spotlight * 0.09;
  }
  color = faceDecoration(color, cameraUv);
  if (u_frame > 0.0) {
    vec2 edge = min(uv, 1.0 - uv) * vec2(u_outputAspect, 1.0);
    float d = min(edge.x, edge.y);
    if (u_frame == 1.0) {
      vec3 neon = 0.55 + 0.45 * cos(vec3(0.0, 2.0, 4.0) + u_time * 0.7 + uv.y * 3.0);
      color += neon * exp(-abs(d - 0.025) * 100.0) * 0.5;
      color = mix(color, neon, 1.0 - smoothstep(0.003, 0.006, abs(d - 0.025)));
    } else if (u_frame == 2.0) {
      float strip = 1.0 - smoothstep(0.036, 0.039, edge.x);
      color = mix(color, vec3(0.025), strip);
      float hole = step(0.009, edge.x) * (1.0 - step(0.027, edge.x)) * step(0.2, fract(uv.y * 22.0)) * (1.0 - step(0.72, fract(uv.y * 22.0)));
      color = mix(color, vec3(0.85), hole);
    } else color = mix(color, vec3(0.96, 0.95, 0.91), 1.0 - smoothstep(0.023, 0.025, d));
  }
  if (u_look > 0.0 && u_lookIntensity > 0.0) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 graded = color;
    if (u_look < 1.5) graded = (mix(vec3(luma), color, 1.08) - 0.5) * 1.04 + 0.51;
    else if (u_look < 2.5) graded = (mix(vec3(luma), color, 0.85) - 0.5) * 1.12 + 0.5 + mix(vec3(-0.025, 0.025, 0.045), vec3(0.04, 0.015, -0.02), smoothstep(0.2, 0.8, luma));
    else if (u_look < 3.5) graded = color * vec3(1.10, 1.02, 0.91);
    else if (u_look < 4.5) graded = color * vec3(0.92, 1.02, 1.10);
    else graded = mix(vec3(luma), color, 0.72) * vec3(0.94, 0.88, 0.76) + vec3(0.065, 0.045, 0.035);
    color = mix(color, clamp(graded, 0.0, 1.0), u_lookIntensity);
  }
  color *= 1.0 - smoothstep(0.25, 1.0, length((uv - 0.5) * 1.414214)) * u_vignette * 0.85;
  if (u_monochrome > 0.0) color = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
  if (u_sepia > 0.0) color = vec3(dot(color, vec3(0.393, 0.769, 0.189)), dot(color, vec3(0.349, 0.686, 0.168)), dot(color, vec3(0.272, 0.534, 0.131)));
  if (u_grain > 0.0) color += (hash(gl_FragCoord.xy + mod(floor(u_time * 24.0), 1000.0)) - 0.5) * u_grain * 0.24;
  if (u_glitch > 0.0) {
    float pulse = step(0.75, hash(vec2(floor(u_time * 9.0), 3.0)));
    color = mix(color, color.gbr, pulse * u_glitch * 0.45);
    color *= 1.0 - u_glitch * 0.13 * step(0.5, fract(gl_FragCoord.y / 3.0));
  }
  return clamp(color, 0.0, 1.0);
}

void main() {
  vec2 screenUv = v_uv;
  if (u_glitch > 0.0) {
    float slice = hash(vec2(floor(v_uv.y * 22.0), floor(u_time * 12.0)));
    screenUv.x = clamp(screenUv.x + (slice - 0.5) * 0.12 * u_glitch * step(0.82, slice), 0.0, 1.0);
  }
  vec2 cameraUv = (screenUv - 0.5) * u_cameraScale + 0.5;
  if (u_mirror) cameraUv.x = 1.0 - cameraUv.x;
  vec2 effectUv = cameraUv;
  if (u_distortion > 0.0 && u_pose.z > 0.0) {
    vec2 q = faceLocal(cameraUv) / vec2(u_pose.z * u_sourceAspect, u_pose.w);
    float falloff = 1.0 - smoothstep(0.0, 1.0, length(q));
    effectUv = u_pose.xy + (cameraUv - u_pose.xy) * (1.0 - u_distortion * falloff * 0.65);
  }
  vec2 beautyUv = enlargeEye(enlargeEye(effectUv, u_eye0), u_eye1);
  vec3 foreground = beautify(beautyUv);
  vec2 backgroundUv = u_liveBackground ? cameraUv : (v_uv - 0.5) * u_backgroundScale + 0.5;
  vec3 background = animateBackground(blurredBackground(backgroundUv) * (1.0 - u_tint), screenUv);
  // Eye enlargement must not move the person's silhouette or glasses coverage.
  float alpha = max(personMask(cameraUv), texture(u_faceMask, cameraUv).b);
  if (u_outline > 0.0) {
    vec2 radius = u_cameraScale * vec2(1.0 / u_outputAspect, 1.0) * u_outlineWidth / 720.0;
    float expanded = alpha;
    for (int i = 0; i < 8; i++) {
      float angle = float(i) * 0.785398;
      vec2 sampleUv = cameraUv + vec2(cos(angle), sin(angle)) * radius;
      expanded = max(expanded, smoothstep(0.12, 0.88, texture(u_mask, sampleUv).r));
    }
    background = mix(background, u_outlineColor.rgb, max(expanded - alpha, 0.0) * u_outline);
  }
  outColor = vec4(finishEffects(mix(background, foreground, alpha), v_uv, cameraUv), 1.0);
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
      'sharpen', 'look', 'lookIntensity', 'vignette', 'outline', 'outlineWidth', 'outlineColor',
      'pose', 'time', 'sourceAspect', 'outputAspect', 'roll', 'weather', 'wave', 'sticker', 'frame', 'spotlight', 'distortion', 'monochrome', 'sepia', 'grain', 'glitch',
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

  render(video: HTMLVideoElement | HTMLCanvasElement, mask: Uint8Array, maskWidth: number, maskHeight: number, mirror: boolean, liveBackground = false, blur = 0, tint = 0, filters?: CameraFilters, regions?: Uint8Array, face?: FaceFeatures | null, effects?: CameraEffects, time = 0): void {
    const sourceWidth = 'videoWidth' in video ? video.videoWidth : video.width;
    const sourceHeight = 'videoHeight' in video ? video.videoHeight : video.height;
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    const enabled = effects?.enabled;
    const pose = face?.pose;
    gl.uniform4f(this.filterLocations.get('pose')!, pose?.center[0] ?? 0, pose?.center[1] ?? 0, pose?.radius[0] ?? 0, pose?.radius[1] ?? 0);
    const effectValues = {
      time: time % 3600, sourceAspect: sourceWidth / sourceHeight, outputAspect: this.canvas.width / this.canvas.height,
      roll: pose?.roll ?? 0,
      look: filters?.enabled ? Math.max(0, ['none', 'natural', 'cinematic', 'warm', 'cool', 'vintage'].indexOf(filters.look ?? 'none')) : 0,
      lookIntensity: filters?.enabled ? (filters.lookIntensity ?? 100) / 100 : 0,
      vignette: enabled ? (effects.vignette ?? 0) / 100 : 0,
      outline: enabled ? (effects.outline ?? 0) / 100 : 0,
      outlineWidth: effects?.outlineWidth ?? 4,
      weather: enabled ? ['none', 'bubbles', 'rain'].indexOf(effects.background) : 0,
      wave: enabled && effects.wavyBorder ? 1 : 0,
      sticker: enabled ? ['none', 'crown', 'heart', 'star'].indexOf(effects.sticker) : 0,
      frame: enabled ? ['none', 'neon', 'film', 'white'].indexOf(effects.frame) : 0,
      spotlight: enabled ? effects.spotlight / 100 : 0,
      distortion: enabled && pose ? effects.distortion / 100 : 0,
      monochrome: enabled && effects.monochrome ? 1 : 0,
      sepia: enabled && effects.sepia ? 1 : 0,
      grain: enabled ? effects.grain / 100 : 0,
      glitch: enabled ? effects.glitch / 100 : 0,
    };
    const outlineHex = /^#[\da-f]{6}$/i.test(effects?.outlineColor ?? '') ? effects!.outlineColor : '#78f5e3';
    const outlineRgb = [1, 3, 5].map((offset) => parseInt(outlineHex.slice(offset, offset + 2), 16) / 255);
    gl.uniform4f(this.filterLocations.get('outlineColor')!, outlineRgb[0], outlineRgb[1], outlineRgb[2], 1);
    for (const [key, value] of Object.entries(effectValues)) gl.uniform1f(this.filterLocations.get(key)!, value);
    for (const key of ['brightness', 'whiteBalance', 'saturation', 'contrast', 'skinBrightening', 'skinSmoothing', 'eyeSize', 'redLips', 'darkHair', 'sharpen'] as const) {
      const needsFace = key === 'eyeSize' || key === 'redLips';
      gl.uniform1f(this.filterLocations.get(key)!, filters?.enabled && (!needsFace || face) ? (filters[key] ?? 0) / 100 : 0);
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
