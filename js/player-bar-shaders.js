import * as THREE from 'three';
import { Renderer, Program, Mesh, Triangle, RenderTarget } from 'ogl';

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const rgbToHex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const rgb01 = ([r, g, b], boost = 1, lift = 0) => [clamp01(r / 255 * boost + lift), clamp01(g / 255 * boost + lift), clamp01(b / 255 * boost + lift)];

const QUAD_VERTEX = `attribute vec2 uv; attribute vec2 position; varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 0, 1); }`;

class OglEffect {
    constructor(container, { antialias = false, premultipliedAlpha = false, webgl = 2 } = {}) {
        this.container = container;
        this.renderer = new Renderer({ alpha: true, premultipliedAlpha, antialias, webgl, dpr: Math.min(window.devicePixelRatio || 1, 2) });
        this.gl = this.renderer.gl;
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.canvas.style.width = '100%';
        this.gl.canvas.style.height = '100%';
        this.gl.canvas.style.display = 'block';
        this.container?.appendChild(this.gl.canvas);
    }

    resize() {
        if (!this.container) return;
        const width = Math.max(1, this.container.clientWidth || 1);
        const height = Math.max(1, this.container.clientHeight || 1);
        this.renderer.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderer.setSize(width, height);
    }

    clear() {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    destroy() {
        this.clear();
        if (this.gl.canvas.parentNode) this.gl.canvas.parentNode.removeChild(this.gl.canvas);
        this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
}

const SOFT_AURORA_FRAGMENT = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform float uSpeed;
uniform float uScale;
uniform float uBrightness;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uNoiseFreq;
uniform float uNoiseAmp;
uniform float uBandHeight;
uniform float uBandSpread;
uniform float uOctaveDecay;
uniform float uLayerOffset;
uniform float uColorSpeed;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uEnableMouse;

#define TAU 6.28318

vec3 gradientHash(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 234.6)), dot(p, vec3(269.5, 183.3, 198.3)), dot(p, vec3(169.5, 283.3, 156.9)));
    vec3 h = fract(sin(p) * 43758.5453123);
    float phi = acos(2.0 * h.x - 1.0);
    float theta = TAU * h.y;
    return vec3(cos(theta) * sin(phi), sin(theta) * cos(phi), cos(phi));
}

float quinticSmooth(float t) {
    float t2 = t * t;
    float t3 = t * t2;
    return 6.0 * t3 * t2 - 15.0 * t2 * t2 + 10.0 * t3;
}

vec3 cosineGradient(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

float perlin3D(float amplitude, float frequency, float px, float py, float pz) {
    float x = px * frequency;
    float y = py * frequency;
    float fx = floor(x); float fy = floor(y); float fz = floor(pz);
    float cx = ceil(x); float cy = ceil(y); float cz = ceil(pz);
    vec3 g000 = gradientHash(vec3(fx, fy, fz));
    vec3 g100 = gradientHash(vec3(cx, fy, fz));
    vec3 g010 = gradientHash(vec3(fx, cy, fz));
    vec3 g110 = gradientHash(vec3(cx, cy, fz));
    vec3 g001 = gradientHash(vec3(fx, fy, cz));
    vec3 g101 = gradientHash(vec3(cx, fy, cz));
    vec3 g011 = gradientHash(vec3(fx, cy, cz));
    vec3 g111 = gradientHash(vec3(cx, cy, cz));
    float d000 = dot(g000, vec3(x - fx, y - fy, pz - fz));
    float d100 = dot(g100, vec3(x - cx, y - fy, pz - fz));
    float d010 = dot(g010, vec3(x - fx, y - cy, pz - fz));
    float d110 = dot(g110, vec3(x - cx, y - cy, pz - fz));
    float d001 = dot(g001, vec3(x - fx, y - fy, pz - cz));
    float d101 = dot(g101, vec3(x - cx, y - fy, pz - cz));
    float d011 = dot(g011, vec3(x - fx, y - cy, pz - cz));
    float d111 = dot(g111, vec3(x - cx, y - cy, pz - cz));
    float sx = quinticSmooth(x - fx);
    float sy = quinticSmooth(y - fy);
    float sz = quinticSmooth(pz - fz);
    float lx00 = mix(d000, d100, sx);
    float lx10 = mix(d010, d110, sx);
    float lx01 = mix(d001, d101, sx);
    float lx11 = mix(d011, d111, sx);
    return amplitude * mix(mix(lx00, lx10, sy), mix(lx01, lx11, sy), sz);
}

float auroraGlow(float t, vec2 shift) {
    vec2 uv = gl_FragCoord.xy / uResolution.y;
    uv += shift;
    float noiseVal = 0.0;
    float freq = uNoiseFreq;
    float amp = uNoiseAmp;
    vec2 samplePos = uv * uScale;
    for (float i = 0.0; i < 3.0; i += 1.0) {
        noiseVal += perlin3D(amp, freq, samplePos.x, samplePos.y, t);
        amp *= uOctaveDecay;
        freq *= 2.0;
    }
    float yBand = uv.y * 10.0 - uBandHeight * 10.0;
    return 0.3 * max(exp(uBandSpread * (1.0 - 1.1 * abs(noiseVal + yBand))), 0.0);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    float t = uSpeed * 0.4 * uTime;
    vec2 shift = vec2(0.0);
    if (uEnableMouse) shift = (uMouse - 0.5) * uMouseInfluence;
    vec3 col = vec3(0.0);
    col += 0.99 * auroraGlow(t, shift) * cosineGradient(uv.x + uTime * uSpeed * 0.2 * uColorSpeed, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.3, 0.20, 0.20)) * uColor1;
    col += 0.99 * auroraGlow(t + uLayerOffset, shift) * cosineGradient(uv.x + uTime * uSpeed * 0.1 * uColorSpeed, vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 0.0), vec3(0.5, 0.20, 0.25)) * uColor2;
    col *= uBrightness;
    float alpha = clamp(length(col), 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
}`;

export class SoftAuroraRenderer extends OglEffect {
    constructor(container) {
        super(container, { premultipliedAlpha: false });
        this.mouse = [0.5, 0.5];
        this.targetMouse = [0.5, 0.5];
        this.program = new Program(this.gl, {
            vertex: QUAD_VERTEX,
            fragment: SOFT_AURORA_FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: [1, 1, 1] },
                uSpeed: { value: 0.6 },
                uScale: { value: 1.5 },
                uBrightness: { value: 1 },
                uColor1: { value: [0.97, 0.97, 0.97] },
                uColor2: { value: [0.88, 0, 1] },
                uNoiseFreq: { value: 2.5 },
                uNoiseAmp: { value: 1 },
                uBandHeight: { value: 0.5 },
                uBandSpread: { value: 1 },
                uOctaveDecay: { value: 0.1 },
                uLayerOffset: { value: 0 },
                uColorSpeed: { value: 1 },
                uMouse: { value: new Float32Array([0.5, 0.5]) },
                uMouseInfluence: { value: 0.25 },
                uEnableMouse: { value: true },
            },
        });
        this.mesh = new Mesh(this.gl, { geometry: new Triangle(this.gl), program: this.program });
        this.gl.canvas.addEventListener('mousemove', (event) => {
            const rect = this.gl.canvas.getBoundingClientRect();
            this.targetMouse = [(event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height];
        });
        this.gl.canvas.addEventListener('mouseleave', () => { this.targetMouse = [0.5, 0.5]; });
        this.resize();
    }

    resize() {
        super.resize();
        this.program.uniforms.uResolution.value = [this.gl.canvas.width, this.gl.canvas.height, this.gl.canvas.width / Math.max(1, this.gl.canvas.height)];
    }

    render(time, color) {
        this.mouse[0] += 0.05 * (this.targetMouse[0] - this.mouse[0]);
        this.mouse[1] += 0.05 * (this.targetMouse[1] - this.mouse[1]);
        this.program.uniforms.uTime.value = time * 0.001;
        this.program.uniforms.uColor1.value = rgb01(color, 1.15, 0.08);
        this.program.uniforms.uColor2.value = rgb01(color, 0.95, 0);
        this.program.uniforms.uScale.value = 1.5;
        this.program.uniforms.uBrightness.value = 1;
        this.program.uniforms.uMouse.value[0] = this.mouse[0];
        this.program.uniforms.uMouse.value[1] = this.mouse[1];
        this.renderer.render({ scene: this.mesh });
    }
}

const SIDE_RAYS_FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform float iTime;
uniform vec2 iResolution;
uniform float iSpeed;
uniform vec3 iRayColor1;
uniform vec3 iRayColor2;
uniform float iIntensity;
uniform float iSpread;
uniform float iFlipX;
uniform float iFlipY;
uniform float iTilt;
uniform float iSaturation;
uniform float iBlend;
uniform float iFalloff;
uniform float iOpacity;

void main() {
    vec2 p = vec2(vUv.x, 1.0 - vUv.y);
    float distanceFromOrigin = length(p * vec2(0.72, 1.0));
    float drift = sin(iTime * iSpeed * 0.32) * 0.045;
    float rayOne = exp(-abs(p.y - (0.18 + drift) * p.x) * 5.5);
    float rayTwo = exp(-abs(p.y - (0.52 - drift * 0.6) * p.x - 0.035) * 4.2);
    float angle = atan(p.y, max(p.x, 0.001));
    float fineRays = 0.68 + 0.32 * sin(angle * 34.0 - iTime * iSpeed);
    float falloff = 0.38 + 0.62 * exp(-distanceFromOrigin * 0.55);
    vec3 color = iRayColor1 * rayOne * (1.0 - iBlend) + iRayColor2 * rayTwo * iBlend;
    color *= fineRays * falloff * iIntensity * 1.45;
    color += mix(iRayColor1, iRayColor2, 0.5) * exp(-length(p * vec2(3.2, 1.6)) * 3.5) * 1.4;
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(gray), color, iSaturation);
    color *= iOpacity;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

export class SideRaysRenderer extends OglEffect {
    constructor(container) {
        super(container);
        this.program = new Program(this.gl, {
            vertex: `attribute vec2 position; attribute vec2 uv; varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`,
            fragment: SIDE_RAYS_FRAGMENT,
            uniforms: {
                iTime: { value: 0 },
                iResolution: { value: [1, 1] },
                iSpeed: { value: 2.5 },
                iRayColor1: { value: [1, 1, 1] },
                iRayColor2: { value: [0.6, 0.78, 1] },
                iIntensity: { value: 2 },
                iSpread: { value: 2 },
                iFlipX: { value: 1 },
                iFlipY: { value: 1 },
                iTilt: { value: 0 },
                iSaturation: { value: 1.5 },
                iBlend: { value: 0.75 },
                iFalloff: { value: 1.6 },
                iOpacity: { value: 1 },
            },
        });
        this.mesh = new Mesh(this.gl, { geometry: new Triangle(this.gl), program: this.program });
        this.resize();
    }

    resize() {
        super.resize();
        this.program.uniforms.iResolution.value = [this.gl.canvas.width, this.gl.canvas.height];
    }

    render(time, color) {
        this.program.uniforms.iTime.value = time * 0.001;
        this.program.uniforms.iRayColor1.value = rgb01(color, 1.25, 0.08);
        this.program.uniforms.iRayColor2.value = rgb01(color, 0.75, 0.18);
        this.program.uniforms.iIntensity.value = 2;
        this.program.uniforms.iSpread.value = 2;
        this.program.uniforms.iFlipX.value = 1;
        // top-left, matching SideRays' originToFlip('top-left') mapping.
        this.program.uniforms.iFlipY.value = 0;
        this.renderer.render({ scene: this.mesh });
    }
}

const SILK_VERTEX = `
varying vec2 vUv;
varying vec3 vPosition;
void main() {
    vPosition = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SILK_FRAGMENT = `
varying vec2 vUv;
varying vec3 vPosition;
uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;
const float e = 2.71828182845904523536;
float noise(vec2 texCoord) {
    float G = e;
    vec2 r = (G * sin(G * texCoord));
    return fract(r.x * r.y * (1.0 + texCoord.x));
}
vec2 rotateUvs(vec2 uv, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    mat2 rot = mat2(c, -s, s, c);
    return rot * uv;
}
void main() {
    float rnd = noise(gl_FragCoord.xy);
    vec2 uv = rotateUvs(vUv * uScale, uRotation);
    vec2 tex = uv * uScale;
    float tOffset = uSpeed * uTime;
    tex.y += 0.03 * sin(8.0 * tex.x - tOffset);
    float pattern = 0.6 + 0.4 * sin(5.0 * (tex.x + tex.y + cos(3.0 * tex.x + 5.0 * tex.y) + 0.02 * tOffset) + sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));
    vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
    col.a = 0.75;
    gl_FragColor = col;
}`;

export class SilkRenderer {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setClearColor(0, 0);
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.display = 'block';
        container.appendChild(this.renderer.domElement);
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.camera.position.z = 1;
        this.uniforms = {
            uSpeed: { value: 5 },
            uScale: { value: 1 },
            uNoiseIntensity: { value: 4.2 },
            uColor: { value: new THREE.Color('#5227FF') },
            uRotation: { value: 0 },
            uTime: { value: 0 },
        };
        this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SILK_VERTEX, fragmentShader: SILK_FRAGMENT, transparent: true });
        this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), this.material));
        this.resize();
    }

    resize() {
        const width = Math.max(1, this.container.clientWidth || 1);
        const height = Math.max(1, this.container.clientHeight || 1);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height, false);
    }

    render(time, color) {
        this.uniforms.uTime.value = time * 0.001;
        this.uniforms.uColor.value.set(rgbToHex(color));
        this.uniforms.uScale.value = 0.72;
        this.uniforms.uNoiseIntensity.value = 4.2;
        this.renderer.render(this.scene, this.camera);
    }

    clear() {
        this.renderer.clear();
    }

    destroy() {
        this.clear();
        this.material.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();
        this.renderer.domElement.remove();
    }
}

const MAX_COLORS = 8;
const STRANDS_VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
const STRANDS_FRAGMENT = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[8];
uniform int uColorCount;
uniform int uStrandCount;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uTaper;
uniform float uSpread;
uniform float uHueShift;
uniform float uIntensity;
uniform float uOpacity;
uniform float uScale;
uniform float uSaturation;
out vec4 fragColor;
const float PI = 3.14159265;
vec3 spectrum(float t) { return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.00, 0.33, 0.67))); }
vec3 samplePalette(float t) {
    t = fract(t);
    float scaled = t * float(uColorCount);
    int idx = int(floor(scaled));
    float blend = fract(scaled);
    int nextIdx = idx + 1;
    if (nextIdx >= uColorCount) nextIdx = 0;
    return mix(uColors[idx], uColors[nextIdx], blend);
}
vec3 strandColor(float t) {
    if (uColorCount > 0) return samplePalette(t);
    return spectrum(t);
}
void main() {
    // The player is much wider than it is tall. Normalizing X by height made
    // the tapered envelope collapse into a tiny repeated-looking centre patch.
    vec2 uv = vec2(
        (gl_FragCoord.x - 0.5 * uResolution.x) / uResolution.x * 1.35,
        (gl_FragCoord.y - 0.5 * uResolution.y) / uResolution.y
    );
    uv /= max(uScale, 0.0001);
    float e = 0.06 + uIntensity * 0.94;
    float env = pow(max(cos(uv.x * PI * 1.3), 0.0), uTaper);
    vec3 col = vec3(0.0);
    for (int i = 0; i < 12; i++) {
        if (i >= uStrandCount) break;
        float fi = float(i);
        float ph = fi * 1.7 * uSpread;
        float freq = (2.0 + fi * 0.35) * uWaviness;
        float spd = 1.4 + fi * 1.2;
        float tt = uTime * uSpeed;
        float w = sin(uv.x * freq + tt * spd + ph) * 0.60 + sin(uv.x * freq * 1.1 - tt * spd * 0.7 + ph * 1.7) * 0.40;
        float amp = (0.1 + 0.02 * e) * env * uAmplitude;
        float y = w * amp;
        float d = abs(uv.y - y);
        float thick = (0.001 + 0.05 * e) * (0.35 + env) * uThickness;
        float g = thick / (d + thick * 0.45);
        g = g * g;
        float h = fi / float(uStrandCount) + uv.x * 0.30 + uTime * 0.04 + uHueShift;
        col += strandColor(h) * g * env;
    }
    col *= 0.45 + 0.7 * e;
    col = 1.0 - exp(-col * uGlow);
    float gray = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(mix(vec3(gray), col, uSaturation), 0.0);
    float lum = max(max(col.r, col.g), col.b);
    float alpha = clamp(lum, 0.0, 1.0) * uOpacity;
    fragColor = vec4(col * uOpacity, alpha);
}`;

const STRANDS_GLASS_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uRefraction;
uniform float uDispersion;
out vec4 fragColor;
vec2 toUv(vec2 p) { return p * (uResolution.y / uResolution) + 0.5; }
void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
    float d = length(p);
    float r = uRadius;
    float edge = fwidth(d) * 1.5;
    float mask = 1.0 - smoothstep(r - edge, r + edge, d);
    if (mask <= 0.0) { fragColor = vec4(0.0); return; }
    float z = sqrt(max(r * r - d * d, 0.0)) / r;
    float nd = d / r;
    vec2 dir = d > 0.0 ? p / d : vec2(0.0);
    float lens = smoothstep(0.85, 1.0, nd) * pow(nd, 6.0);
    vec2 offset = -dir * lens * uRefraction * 0.15;
    vec2 disp = -dir * lens * uDispersion * 0.012;
    vec3 light;
    light.r = texture(uScene, toUv(p + offset - disp)).r;
    light.g = texture(uScene, toUv(p + offset)).g;
    light.b = texture(uScene, toUv(p + offset + disp)).b;
    float fres = pow(1.0 - z, 3.0);
    vec3 rim = vec3(1.0) * fres * 0.18;
    vec2 lightDir = normalize(vec2(-0.55, 0.6));
    float spec = pow(max(dot(p / max(r, 1e-4), lightDir), 0.0), 6.0);
    spec *= smoothstep(r, r * 0.55, d);
    vec3 emissive = light + rim + vec3(spec) * 0.4;
    float emissiveA = clamp(max(max(emissive.r, emissive.g), emissive.b), 0.0, 1.0);
    float bodyA = 0.05 + fres * 0.05;
    float outA = emissiveA + bodyA * (1.0 - emissiveA);
    vec3 outRGB = emissive;
    outRGB *= mask;
    outA *= mask;
    fragColor = vec4(outRGB, outA);
}`;

const buildPalette = (color) => {
    const base = rgb01(color, 1, 0);
    const rotateHue = (degrees) => {
        const angle = degrees * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const [r, g, b] = color;
        return [
            Math.min(255, Math.max(0, (0.213 + cos * 0.787 - sin * 0.213) * r + (0.715 - cos * 0.715 - sin * 0.715) * g + (0.072 - cos * 0.072 + sin * 0.928) * b)),
            Math.min(255, Math.max(0, (0.213 - cos * 0.213 + sin * 0.143) * r + (0.715 + cos * 0.285 + sin * 0.140) * g + (0.072 - cos * 0.072 - sin * 0.283) * b)),
            Math.min(255, Math.max(0, (0.213 - cos * 0.213 - sin * 0.787) * r + (0.715 - cos * 0.715 + sin * 0.715) * g + (0.072 + cos * 0.928 + sin * 0.072) * b)),
        ];
    };
    const warm = rgb01(rotateHue(34), 1.22, 0.05);
    const cool = rgb01(rotateHue(-42), 1.18, 0.04);
    const colors = [base, warm, cool];
    const padded = [];
    for (let i = 0; i < MAX_COLORS; i++) padded.push(colors[i % colors.length]);
    return padded;
};

export class StrandsRenderer extends OglEffect {
    constructor(container) {
        super(container, { antialias: true, premultipliedAlpha: true, webgl: 2 });
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
        const geometry = new Triangle(this.gl);
        if (geometry.attributes.uv) delete geometry.attributes.uv;
        this.program = new Program(this.gl, {
            vertex: STRANDS_VERTEX,
            fragment: STRANDS_FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: [1, 1] },
                uColors: { value: buildPalette([167, 139, 250]) },
                uColorCount: { value: 3 },
                uStrandCount: { value: 3 },
                uSpeed: { value: 0.5 },
                uAmplitude: { value: 1 },
                uWaviness: { value: 1 },
                uThickness: { value: 0.7 },
                uGlow: { value: 2.6 },
                uTaper: { value: 3 },
                uSpread: { value: 1 },
                uHueShift: { value: 0 },
                uIntensity: { value: 0.6 },
                uOpacity: { value: 1 },
                uScale: { value: 1.5 },
                uSaturation: { value: 2 },
            },
        });
        this.mesh = new Mesh(this.gl, { geometry, program: this.program });
        this.renderTarget = new RenderTarget(this.gl, { width: 1, height: 1 });
        this.glassProgram = new Program(this.gl, {
            vertex: STRANDS_VERTEX,
            fragment: STRANDS_GLASS_FRAGMENT,
            uniforms: {
                uScene: { value: this.renderTarget.texture },
                uResolution: { value: [1, 1] },
                uRadius: { value: 0.46 },
                uRefraction: { value: 1 },
                uDispersion: { value: 1 },
            },
        });
        this.glassMesh = new Mesh(this.gl, { geometry, program: this.glassProgram });
        this.resize();
    }

    resize() {
        super.resize();
        const width = this.container.clientWidth || 1;
        const height = this.container.clientHeight || 1;
        this.program.uniforms.uResolution.value = [width, height];
        this.glassProgram.uniforms.uResolution.value = [width, height];
        this.renderTarget.setSize(width, height);
    }

    render(time, color) {
        this.program.uniforms.uTime.value = time * 0.001;
        this.program.uniforms.uColors.value = buildPalette(color);
        this.program.uniforms.uStrandCount.value = 3;
        this.program.uniforms.uAmplitude.value = 1;
        this.program.uniforms.uIntensity.value = 0.8;
        this.program.uniforms.uScale.value = 1.25;
        this.renderer.render({ scene: this.mesh });
    }
}

const DARK_VEIL_FRAGMENT = `
#ifdef GL_ES
precision lowp float;
#endif
uniform vec2 uResolution;
uniform float uTime;
uniform float uHueShift;
uniform float uNoise;
uniform float uScan;
uniform float uScanFreq;
uniform float uWarp;
#define iTime uTime
#define iResolution uResolution
vec4 buf[8];
float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
mat3 rgb2yiq=mat3(0.299,0.587,0.114,0.596,-0.274,-0.322,0.211,-0.523,0.312);
mat3 yiq2rgb=mat3(1.0,0.956,0.621,1.0,-0.272,-0.647,1.0,-1.106,1.703);
vec3 hueShiftRGB(vec3 col,float deg){
    vec3 yiq=rgb2yiq * col;
    float rad=radians(deg);
    float cosh=cos(rad),sinh=sin(rad);
    vec3 yiqShift=vec3(yiq.x, yiq.y*cosh-yiq.z*sinh, yiq.y*sinh+yiq.z*cosh);
    return clamp(yiq2rgb * yiqShift,0.0,1.0);
}
vec4 sigmoid(vec4 x){return 1./(1.+exp(-x));}
vec4 cppn_fn(vec2 coordinate,float in0,float in1,float in2){
buf[6]=vec4(coordinate.x,coordinate.y,0.3948333106474662+in0,0.36+in1);
buf[7]=vec4(0.14+in2,sqrt(coordinate.x*coordinate.x+coordinate.y*coordinate.y),0.,0.);
buf[0]=mat4(vec4(6.5404263,-3.6126034,0.7590882,-1.13613),vec4(2.4582713,3.1660357,1.2219609,0.06276096),vec4(-5.478085,-6.159632,1.8701609,-4.7742867),vec4(6.039214,-5.542865,-0.90925294,3.251348))*buf[6]+mat4(vec4(0.8473259,-5.722911,3.975766,1.6522468),vec4(-0.24321538,0.5839259,-1.7661959,-5.350116),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(0.21808943,1.1243913,-1.7969975,5.0294676);
buf[1]=mat4(vec4(-3.3522482,-6.0612736,0.55641043,-4.4719114),vec4(0.8631464,1.7432913,5.643898,1.6106541),vec4(2.4941394,-3.5012043,1.7184316,6.357333),vec4(3.310376,8.209261,1.1355612,-1.165539))*buf[6]+mat4(vec4(5.24046,-13.034365,0.009859298,15.870829),vec4(2.987511,3.129433,-0.89023495,-1.6822904),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-5.9457836,-6.573602,-0.8812491,1.5436668);
buf[0]=sigmoid(buf[0]);buf[1]=sigmoid(buf[1]);
buf[2]=mat4(vec4(-15.219568,8.095543,-2.429353,-1.9381982),vec4(-5.951362,4.3115187,2.6393783,1.274315),vec4(-7.3145227,6.7297835,5.2473326,5.9411426),vec4(5.0796127,8.979051,-1.7278991,-1.158976))*buf[6]+mat4(vec4(-11.967154,-11.608155,6.1486754,11.237008),vec4(2.124141,-6.263192,-1.7050359,-0.7021966),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-4.17164,-3.2281182,-4.576417,-3.6401186);
buf[3]=mat4(vec4(3.1832156,-13.738922,1.879223,3.233465),vec4(0.64300746,12.768129,1.9141049,0.50990224),vec4(-0.049295485,4.4807224,1.4733979,1.801449),vec4(5.0039253,13.000481,3.3991797,-4.5561905))*buf[6]+mat4(vec4(-0.1285731,7.720628,-3.1425676,4.742367),vec4(0.6393625,3.714393,-0.8108378,-0.39174938),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-1.1811101,-21.621881,0.7851888,1.2329718);
buf[2]=sigmoid(buf[2]);buf[3]=sigmoid(buf[3]);
buf[4]=mat4(vec4(5.214916,-7.183024,2.7228765,2.6592617),vec4(-5.601878,-25.3591,4.067988,0.4602802),vec4(-10.57759,24.286327,21.102104,37.546658),vec4(4.3024497,-1.9625226,2.3458803,-1.372816))*buf[0]+mat4(vec4(-17.6526,-10.507558,2.2587414,12.462782),vec4(6.265566,-502.75443,-12.642513,0.9112289),vec4(-10.983244,20.741234,-9.701768,-0.7635988),vec4(5.383626,1.4819539,-4.1911616,-4.8444734))*buf[1]+mat4(vec4(12.785233,-16.345072,-0.39901125,1.7955981),vec4(-30.48365,-1.8345358,1.4542528,-1.1118771),vec4(19.872723,-7.337935,-42.941723,-98.52709),vec4(8.337645,-2.7312303,-2.2927687,-36.142323))*buf[2]+mat4(vec4(-16.298317,3.5471997,-0.44300047,-9.444417),vec4(57.5077,-35.609753,16.163465,-4.1534753),vec4(-0.07470326,-3.8656476,-7.0901804,3.1523974),vec4(-12.559385,-7.077619,1.490437,-0.8211543))*buf[3]+vec4(-7.67914,15.927437,1.3207729,-1.6686112);
buf[5]=mat4(vec4(-1.4109162,-0.372762,-3.770383,-21.367174),vec4(-6.2103205,-9.35908,0.92529047,8.82561),vec4(11.460242,-22.348068,13.625772,-18.693201),vec4(-0.3429052,-3.9905605,-2.4626114,-0.45033523))*buf[0]+mat4(vec4(7.3481627,-4.3661838,-6.3037653,-3.868115),vec4(1.5462853,6.5488915,1.9701879,-0.58291394),vec4(6.5858274,-2.2180402,3.7127688,-1.3730392),vec4(-5.7973905,10.134961,-2.3395722,-5.965605))*buf[1]+mat4(vec4(-2.5132585,-6.6685553,-1.4029363,-0.16285264),vec4(-0.37908727,0.53738135,4.389061,-1.3024765),vec4(-0.70647055,2.0111287,-5.1659346,-3.728635),vec4(-13.562562,10.487719,-0.9173751,-2.6487076))*buf[2]+mat4(vec4(-8.645013,6.5546675,-6.3944063,-5.5933375),vec4(-0.57783127,-1.077275,36.91025,5.736769),vec4(14.283112,3.7146652,7.1452246,-4.5958776),vec4(2.7192075,3.6021907,-4.366337,-2.3653464))*buf[3]+vec4(-5.9000807,-4.329569,1.2427121,8.59503);
buf[4]=sigmoid(buf[4]);buf[5]=sigmoid(buf[5]);
buf[6]=mat4(vec4(-1.61102,0.7970257,1.4675229,0.20917463),vec4(-28.793737,-7.1390953,1.5025433,4.656581),vec4(-10.94861,39.66238,0.74318546,-10.095605),vec4(-0.7229728,-1.5483948,0.7301322,2.1687684))*buf[0]+mat4(vec4(3.2547753,21.489103,-1.0194173,-3.3100595),vec4(-3.7316632,-3.3792162,-7.223193,-0.23685838),vec4(13.1804495,0.7916005,5.338587,5.687114),vec4(-4.167605,-17.798311,-6.815736,-1.6451967))*buf[1]+mat4(vec4(0.604885,-7.800309,-7.213122,-2.741014),vec4(-3.522382,-0.12359311,-0.5258442,0.43852118),vec4(9.6752825,-22.853785,2.062431,0.099892326),vec4(-4.3196306,-17.730087,2.5184598,5.30267))*buf[2]+mat4(vec4(-6.545563,-15.790176,-6.0438633,-5.415399),vec4(-43.591583,28.551912,-16.00161,18.84728),vec4(4.212382,8.394307,3.0958717,8.657522),vec4(-5.0237565,-4.450633,-4.4768,-5.5010443))*buf[3]+mat4(vec4(1.6985557,-67.05806,6.897715,1.9004834),vec4(1.8680354,2.3915145,2.5231109,4.081538),vec4(11.158006,1.7294737,2.0738268,7.386411),vec4(-4.256034,-306.24686,8.258898,-17.132736))*buf[4]+mat4(vec4(1.6889864,-4.5852966,3.8534803,-6.3482175),vec4(1.3543309,-1.2640043,9.932754,2.9079645),vec4(-5.2770967,0.07150358,-0.13962056,3.3269649),vec4(28.34703,-4.918278,6.1044083,4.085355))*buf[5]+vec4(6.6818056,12.522166,-3.7075126,-4.104386);
buf[7]=mat4(vec4(-8.265602,-4.7027016,5.098234,0.7509808),vec4(8.6507845,-17.15949,16.51939,-8.884479),vec4(-4.036479,-2.3946867,-2.6055532,-1.9866527),vec4(-2.2167742,-1.8135649,-5.9759874,4.8846445))*buf[0]+mat4(vec4(6.7790847,3.5076547,-2.8191125,-2.7028968),vec4(-5.743024,-0.27844876,1.4958696,-5.0517144),vec4(13.122226,15.735168,-2.9397483,-4.101023),vec4(-14.375265,-5.030483,-6.2599335,2.9848232))*buf[1]+mat4(vec4(4.0950394,-0.94011575,-5.674733,4.755022),vec4(4.3809423,4.8310084,1.7425908,-3.437416),vec4(2.117492,0.16342592,-104.56341,16.949184),vec4(-5.22543,-2.994248,3.8350096,-1.9364246))*buf[2]+mat4(vec4(-5.900337,1.7946124,-13.604192,-3.8060522),vec4(6.6583457,31.911177,25.164474,91.81147),vec4(11.840538,4.1503043,-0.7314397,6.768467),vec4(-6.3967767,4.034772,6.1714606,-0.32874924))*buf[3]+mat4(vec4(3.4992442,-196.91893,-8.923708,2.8142626),vec4(3.4806502,-3.1846354,5.1725626,5.1804223),vec4(-2.4009497,15.585794,1.2863957,2.0252278),vec4(-71.25271,-62.441242,-8.138444,0.50670296))*buf[4]+mat4(vec4(-12.291733,-11.176166,-7.3474145,4.390294),vec4(10.805477,5.6337385,-0.9385842,-4.7348723),vec4(-12.869276,-7.039391,5.3029537,7.5436664),vec4(1.4593618,8.91898,3.5101583,5.840625))*buf[5]+vec4(2.2415268,-6.705987,-0.98861027,-2.117676);
buf[6]=sigmoid(buf[6]);buf[7]=sigmoid(buf[7]);
buf[0]=mat4(vec4(1.6794263,1.3817469,2.9625452,0.),vec4(-1.8834411,-1.4806935,-3.5924516,0.),vec4(-1.3279216,-1.0918057,-2.3124623,0.),vec4(0.2662234,0.23235129,0.44178495,0.))*buf[0]+mat4(vec4(-0.6299101,-0.5945583,-0.9125601,0.),vec4(0.17828953,0.18300213,0.18182953,0.),vec4(-2.96544,-2.5819945,-4.9001055,0.),vec4(1.4195864,1.1868085,2.5176322,0.))*buf[1]+mat4(vec4(-1.2584374,-1.0552157,-2.1688404,0.),vec4(-0.7200217,-0.52666044,-1.438251,0.),vec4(0.15345335,0.15196142,0.272854,0.),vec4(0.945728,0.8861938,1.2766753,0.))*buf[2]+mat4(vec4(-2.4218085,-1.968602,-4.35166,0.),vec4(-22.683098,-18.0544,-41.954372,0.),vec4(0.63792,0.5470648,1.1078634,0.),vec4(-1.5489894,-1.3075932,-2.6444845,0.))*buf[3]+mat4(vec4(-0.49252132,-0.39877754,-0.91366625,0.),vec4(0.95609266,0.7923952,1.640221,0.),vec4(0.30616966,0.15693925,0.8639857,0.),vec4(1.1825981,0.94504964,2.176963,0.))*buf[4]+mat4(vec4(0.35446745,0.3293795,0.59547555,0.),vec4(-0.58784515,-0.48177817,-1.0614829,0.),vec4(2.5271258,1.9991658,4.6846647,0.),vec4(0.13042648,0.08864098,0.30187556,0.))*buf[5]+mat4(vec4(-1.7718065,-1.403319,-3.3355875,0.),vec4(3.1664357,2.638297,5.378702,0.),vec4(-3.1724713,-2.6107926,-5.549295,0.),vec4(-2.851368,-2.249092,-5.3013067,0.))*buf[6]+mat4(vec4(1.5203838,1.2212278,2.8404984,0.),vec4(1.5210563,1.2651345,2.683903,0.),vec4(2.9789467,2.4364579,5.2347264,0.),vec4(2.2270417,1.8825914,3.8028636,0.))*buf[7]+vec4(-1.5468478,-3.6171484,0.24762098,0.);
buf[0]=sigmoid(buf[0]);
return vec4(buf[0].x,buf[0].y,buf[0].z,1.);
}
void mainImage(out vec4 fragColor,in vec2 fragCoord){
    vec2 uv=fragCoord/uResolution.xy*2.-1.;
    uv.y*=-1.;
    uv+=uWarp*vec2(sin(uv.y*6.283+uTime*0.5),cos(uv.x*6.283+uTime*0.5))*0.05;
    fragColor=cppn_fn(uv,0.1*sin(0.3*uTime),0.1*sin(0.69*uTime),0.1*sin(0.44*uTime));
}
void main(){
    vec4 col; mainImage(col,gl_FragCoord.xy);
    col.rgb=hueShiftRGB(col.rgb,uHueShift);
    float scanline_val=sin(gl_FragCoord.y*uScanFreq)*0.5+0.5;
    col.rgb*=1.-(scanline_val*scanline_val)*uScan;
    col.rgb+=(rand(gl_FragCoord.xy+uTime)-0.5)*uNoise;
    gl_FragColor=vec4(clamp(col.rgb,0.0,1.0),0.7);
}`;

export class DarkVeilRenderer extends OglEffect {
    constructor(container) {
        super(container, { webgl: 1 });
        this.fragmentSource = DARK_VEIL_FRAGMENT;
        this.gl.canvas.style.display = 'none';
        this.element = document.createElement('div');
        this.element.className = 'player-cover-blur-effect';
        container.appendChild(this.element);
    }

    resize() {
        super.resize();
    }

    getCoverUrl() {
        const cover = document.querySelector('.now-playing-bar .cover');
        return cover?.currentSrc || cover?.src || '/assets/appicon.png';
    }

    render(time, color) {
        const pulse = 0.32 + (Math.sin(time * 0.0021) + Math.sin(time * 0.0037 + 1.4)) * 0.035;
        this.element.style.setProperty('--cover-image', `url("${this.getCoverUrl().replaceAll('"', '\\"')}")`);
        this.element.style.setProperty('--blur-accent', `${color[0]} ${color[1]} ${color[2]}`);
        this.element.style.setProperty('--blur-pulse', pulse.toFixed(3));
        this.element.style.opacity = '1';
    }

    clear() {
        super.clear();
        this.element.style.opacity = '0';
    }

    destroy() {
        super.destroy();
        this.element.remove();
    }
}

const RING_VERTEX = `void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const RING_FRAGMENT = `
precision highp float;

uniform float uTime, uAttenuation, uLineThickness;
uniform float uBaseRadius, uRadiusStep, uScaleRate;
uniform float uOpacity, uNoiseAmount, uRotation, uRingGap;
uniform float uFadeIn, uFadeOut;
uniform float uMouseInfluence, uHoverAmount, uHoverScale, uParallax, uBurst;
uniform vec2 uResolution, uMouse;
uniform vec3 uColor, uColorTwo;
uniform int uRingCount;

const float HP = 1.5707963;
const float CYCLE = 3.45;

float fade(float t) {
  return t < uFadeIn ? smoothstep(0.0, uFadeIn, t) : 1.0 - smoothstep(uFadeOut, CYCLE - 0.2, t);
}

float ring(vec2 p, float ri, float cut, float t0, float px) {
  float t = mod(uTime + t0, CYCLE);
  float r = ri + t / CYCLE * uScaleRate;
  float d = abs(length(p) - r);
  float a = atan(abs(p.y), abs(p.x)) / HP;
  float th = max(1.0 - a, 0.5) * px * uLineThickness;
  float h = (1.0 - smoothstep(th, th * 1.5, d)) + 1.0;
  d += pow(cut * a, 3.0) * r;
  return h * exp(-uAttenuation * d) * fade(t);
}

void main() {
  float px = 1.0 / min(uResolution.x, uResolution.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) * px;
  float cr = cos(uRotation), sr = sin(uRotation);
  p = mat2(cr, -sr, sr, cr) * p;
  p -= uMouse * uMouseInfluence;
  float sc = mix(1.0, uHoverScale, uHoverAmount) + uBurst * 0.3;
  p /= sc;
  vec3 c = vec3(0.0);
  float rcf = max(float(uRingCount) - 1.0, 1.0);
  for (int i = 0; i < 10; i++) {
    if (i >= uRingCount) break;
    float fi = float(i);
    vec2 pr = p - fi * uParallax * uMouse;
    vec3 rc = mix(uColor, uColorTwo, fi / rcf);
    c = mix(c, rc, vec3(ring(pr, uBaseRadius + fi * uRadiusStep, pow(uRingGap, fi), i == 0 ? 0.0 : 2.95 * fi, px)));
  }
  c *= 1.0 + uBurst * 2.0;
  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * uNoiseAmount;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)) * uOpacity);
}`;

export class MagicRingsRenderer {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setClearColor(0, 0);
        container.appendChild(this.renderer.domElement);
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
        this.camera.position.z = 1;
        this.uniforms = {
            uTime: { value: 0 },
            uAttenuation: { value: 10 },
            uResolution: { value: new THREE.Vector2() },
            uColor: { value: new THREE.Color('#ffffff') },
            uColorTwo: { value: new THREE.Color('#8b5cf6') },
            uLineThickness: { value: 2 },
            uBaseRadius: { value: 0.28 },
            uRadiusStep: { value: 0.09 },
            uScaleRate: { value: 1 },
            uRingCount: { value: 6 },
            uOpacity: { value: 1 },
            uNoiseAmount: { value: 0.1 },
            uRotation: { value: 0 },
            uRingGap: { value: 1.5 },
            uFadeIn: { value: 0.7 },
            uFadeOut: { value: 0.5 },
            uMouse: { value: new THREE.Vector2() },
            uMouseInfluence: { value: 0.16 },
            uHoverAmount: { value: 0 },
            uHoverScale: { value: 1.2 },
            uParallax: { value: 0.05 },
            uBurst: { value: 0 },
        };
        this.material = new THREE.ShaderMaterial({ vertexShader: RING_VERTEX, fragmentShader: RING_FRAGMENT, uniforms: this.uniforms, transparent: true, blending: THREE.AdditiveBlending });
        this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material));
        this.pointer = new THREE.Vector2();
        this.smoothPointer = new THREE.Vector2();
        this.hoverTarget = 0;
        this.lastFrame = 0;
        this.resize();
    }

    resize() {
        const width = Math.max(1, this.container.clientWidth || 1);
        const height = Math.max(1, this.container.clientHeight || 1);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(width, height, false);
        this.uniforms.uResolution.value.set(width * dpr, height * dpr);
        this.uniforms.uScaleRate.value = Math.min(5, Math.max(0.9, width / height * 0.48));
    }

    burst(color) {
        this.uniforms.uColor.value.set(rgbToHex(color));
        this.uniforms.uColorTwo.value.set('#ffffff');
        this.started = performance.now();
        this.burstValue = 1;
        this.lastFrame = this.started;
        this.container.classList.add('is-active');
        cancelAnimationFrame(this.frame);
        this.tick();
    }

    tick = () => {
        const now = performance.now();
        const elapsed = now - this.started;
        if (elapsed > 3450) {
            this.container.classList.remove('is-active');
            this.renderer.clear();
            return;
        }
        const delta = Math.min(50, now - this.lastFrame) / 1000;
        this.lastFrame = now;
        this.uniforms.uTime.value = elapsed * 0.001;
        const smoothing = 1 - Math.exp(-delta * 8);
        this.smoothPointer.lerp(this.pointer, smoothing);
        this.uniforms.uMouse.value.copy(this.smoothPointer);
        this.uniforms.uHoverAmount.value += (this.hoverTarget - this.uniforms.uHoverAmount.value) * smoothing;
        this.burstValue *= Math.exp(-delta * 3.2);
        if (this.burstValue < 0.001) this.burstValue = 0;
        this.uniforms.uBurst.value = this.burstValue;
        const fadeIn = Math.min(1, elapsed / 180);
        const fadeOut = Math.min(1, Math.max(0, (3450 - elapsed) / 720));
        this.uniforms.uOpacity.value = fadeIn * fadeOut;
        this.renderer.render(this.scene, this.camera);
        this.frame = requestAnimationFrame(this.tick);
    };

    setPointer(x, y, hovered) {
        this.pointer.set(x, y);
        this.hoverTarget = hovered ? 1 : 0;
    }

    stop() {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.container.classList.remove('is-active');
        this.renderer.clear();
    }
}
