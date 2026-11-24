import * as THREE from 'three';

const BASE_HEIGHT = 270;

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform float uDither;
uniform float uLevels;
varying vec2 vUv;
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;                       // soft vignette
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));       // linear -> display
  float threshold = mix(0.5, bayer4(gl_FragCoord.xy), uDither);
  c = floor(c * uLevels + threshold) / uLevels;       // colour quantise with ordered dither
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * The retro pipeline: the scene is rendered to a tiny linear HDR target (270 lines tall), then a
 * post pass applies vignette, gamma, ordered dither and colour quantisation. The canvas itself
 * stays low resolution and CSS upscales it with nearest-neighbour (`image-rendering: pixelated`).
 */
export class RetroRenderer {
  readonly gl: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private readonly postScene = new THREE.Scene();
  private readonly postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly postMat: THREE.ShaderMaterial;
  /** 1 = 270p, 2 = 540p. */
  scale = 1;
  width = 480;
  height = BASE_HEIGHT;
  lastDrawCalls = 0;
  lastTriangles = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(1);
    this.gl.info.autoReset = false;
    this.target = this.makeTarget();
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.target.texture }, uDither: { value: 1 }, uLevels: { value: 31 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }

  private makeTarget(): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
  }

  set dither(on: boolean) {
    this.postMat.uniforms.uDither!.value = on ? 1 : 0;
  }

  /** Match the internal resolution to the window's aspect ratio. Returns the aspect. */
  resize(windowW: number, windowH: number): number {
    const aspect = windowW / Math.max(1, windowH);
    this.height = BASE_HEIGHT * this.scale;
    this.width = Math.max(2, Math.round((this.height * aspect) / 2) * 2);
    this.gl.setSize(this.width, this.height, false);
    this.target.dispose();
    this.target = this.makeTarget();
    this.postMat.uniforms.tScene!.value = this.target.texture;
    return aspect;
  }

  /** `overlay` (the first-person weapon) is drawn on top of the world after a depth clear. */
  render(scene: THREE.Scene, camera: THREE.Camera, overlay?: { scene: THREE.Scene; camera: THREE.Camera } | null): void {
    this.gl.info.reset();
    this.gl.setRenderTarget(this.target);
    this.gl.render(scene, camera);
    if (overlay) {
      this.gl.autoClear = false;
      this.gl.clearDepth();
      this.gl.render(overlay.scene, overlay.camera);
      this.gl.autoClear = true;
    }
    this.lastDrawCalls = this.gl.info.render.calls;
    this.lastTriangles = this.gl.info.render.triangles;
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCam);
  }
}
