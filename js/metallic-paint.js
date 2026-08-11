// Native JavaScript port of React Bits' MetallicPaint WebGL effect.
const vertexShader = `#version 300 es
precision highp float;
in vec2 a_position; out vec2 vP;
void main(){vP=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;

const fragmentShader = `#version 300 es
precision highp float;
in vec2 vP; out vec4 oC;
uniform sampler2D u_tex;
uniform float u_time,u_ratio,u_imgRatio,u_seed,u_scale,u_refract,u_blur,u_liquid;
uniform float u_bright,u_contrast,u_angle,u_fresnel,u_sharp,u_wave,u_noise,u_chroma,u_distort,u_contour;
uniform vec3 u_lightColor,u_darkColor,u_tint;
vec3 sC,sM;
vec3 pW(vec3 v){vec3 i=floor(v),f=fract(v),s=sign(fract(v*.5)-.5),h=fract(sM*i+i.yzx),c=f*(f-1.);return s*c*((h*16.-4.)*c-1.);}
vec3 aF(vec3 b,vec3 c){return pW(b+c.zxy-pW(b.zxy+c.yzx)+pW(b.yzx+c.xyz));}
vec3 lM(vec3 s,vec3 p){return(p+aF(s,p))*.5;}
vec2 fA(){vec2 c=vP-.5;c.x*=u_ratio>u_imgRatio?u_ratio/u_imgRatio:1.;c.y*=u_ratio>u_imgRatio?1.:u_imgRatio/u_ratio;return vec2(c.x+.5,.5-c.y);}
vec2 rot(vec2 p,float r){float c=cos(r),s=sin(r);return vec2(p.x*c+p.y*s,p.y*c-p.x*s);}
float bM(vec2 c,float t){vec2 l=smoothstep(vec2(0.),vec2(t),c),u=smoothstep(vec2(0.),vec2(t),1.-c);return l.x*l.y*u.x*u.y;}
float mG(float hi,float lo,float t,float sh,float cv){sh*=(2.-u_sharp);float ci=smoothstep(.15,.85,cv),r=lo,e1=.08/u_scale;r=mix(r,hi,smoothstep(0.,sh*1.5,t));r=mix(r,lo,smoothstep(e1-sh,e1+sh,t));float e2=e1+.05/u_scale*(1.-ci*.35);r=mix(r,hi,smoothstep(e2-sh,e2+sh,t));float e3=e2+.025/u_scale*(1.-ci*.45);r=mix(r,lo,smoothstep(e3-sh,e3+sh,t));float e4=e1+.1/u_scale;r=mix(r,hi,smoothstep(e4-sh,e4+sh,t));float gT=clamp((t-e4)/(1.-e4),0.,1.);return mix(r,mix(hi,lo,smoothstep(0.,1.,gT)),smoothstep(e4-sh*.5,e4+sh*.5,t));}
void main(){
 sC=fract(vec3(.7548,.5698,.4154)*(u_seed+17.31))+.5;sM=fract(sC.zxy-sC.yzx*1.618);
 vec2 sc=vec2(vP.x*u_ratio,1.-vP.y);sc=rot(sc-.5,u_angle*3.14159/180.)+.5;sc=clamp(sc,0.,1.);float sl=sc.x-sc.y,an=u_time*.001;
 vec2 iC=fA();vec4 texSample=texture(u_tex,iC);float dp=texSample.r,shapeMask=texSample.a;vec3 hi=u_lightColor*u_bright,lo=u_darkColor*(2.-u_bright);lo.b+=smoothstep(.6,1.4,sc.x+sc.y)*.08;
 vec2 fC=sc-.5;float rd=length(fC+vec2(0.,sl*.15));vec2 ag=rot(fC,(.22-sl*.18)*3.14159);float cv=(1.-pow(rd*1.65,1.15))*pow(sc.y,.35);float vs=shapeMask*bM(iC,.01);float fr=pow(1.-cv,u_fresnel)*.3;vs=min(vs+fr*vs,1.);
 float mT=an*.0625;vec3 wO=vec3(-1.05,1.35,1.55),wA=aF(vec3(31.,73.,56.),mT+wO)*.22*u_wave,wB=aF(vec3(24.,64.,42.),mT-wO.yzx)*.22*u_wave;vec2 nC=sc*45.*u_noise;nC+=aF(sC.zxy,an*.17*sC.yzx-sc.yxy*.35).xy*18.*u_wave;vec3 tC=vec3(.00041,.00053,.00076)*mT+wB*nC.x+wA*nC.y;tC=lM(sC,tC);tC=lM(sC+1.618,tC);float tb=sin(tC.x*3.14159)*2.-1.;float noiseVal=pW(vec3(sc*8.+an,an*.5)).x,edgeFactor=smoothstep(0.,.5,dp)*smoothstep(1.,.5,dp),lD=dp+(1.-dp)*u_liquid*tb;lD+=noiseVal*u_distort*.15*edgeFactor;
 float rB=clamp(1.-cv,0.,1.),fl=ag.x+sl;fl+=noiseVal*sl*u_distort*edgeFactor;fl*=mix(1.,1.-dp*.5,u_contour);fl-=dp*u_contour*.8;float eI=smoothstep(0.,1.,lD)*smoothstep(1.,0.,lD);fl-=tb*sl*1.8*eI;float cA=cv*clamp(pow(sc.y,.12),.25,1.);fl*=.12+(1.05-lD)*cA;fl*=smoothstep(1.,.65,lD);fl*=.45+pow(sc.y,2.)*.55;fl*=u_scale;fl-=an;
 float rO=rB+cv*tb*.025;bM(iC,.01);rO-=sl;float bO=rB*1.25-lD*.18;rO*=u_refract*u_chroma;bO*=u_refract*u_chroma;float sf=u_blur;float rC=mG(hi.r,lo.r,fract(fl+rO),sf+.018+u_refract*cv*.025,cv),gC=mG(hi.g,lo.g,fract(fl),sf+.008/max(.01,1.-sl),cv),bC=mG(hi.b,lo.b,fract(fl-bO),sf+.008,cv);vec3 col=clamp((vec3(rC,gC,bC)-.5)*u_contrast+.5,0.,1.);col=mix(col,1.-min(vec3(1.),(1.-col)/max(u_tint,vec3(.001))),length(u_tint-1.)*.5);oC=vec4(clamp(col,0.,1.)*vs,vs);
}`;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function processImage(image) {
    const side = 720;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, side, side);
    const source = context.getImageData(0, 0, side, side);
    const output = context.createImageData(side, side);
    for (let i = 0; i < source.data.length; i += 4) {
        const alpha = source.data[i + 3];
        // The supplied logo is black with transparency; alpha is the shape mask.
        output.data[i] = output.data[i + 1] = output.data[i + 2] = 128;
        output.data[i + 3] = alpha;
    }
    return output;
}

export class MetallicPaint {
    constructor(canvas, imageSrc, options = {}) {
        this.canvas = canvas;
        this.imageSrc = imageSrc;
        this.options = {
            seed: 42,
            scale: 4,
            refraction: 0.01,
            blur: 0.015,
            liquid: 0.75,
            speed: 0.3,
            brightness: 1.45,
            contrast: 0.68,
            angle: 0,
            fresnel: 1,
            lightColor: '#ffffff',
            darkColor: '#050507',
            patternSharpness: 1,
            waveAmplitude: 1,
            noiseScale: 0.5,
            chromaticSpread: 2,
            distortion: 1,
            contour: 0.2,
            tintColor: '#d5cbff',
            ...options,
        };
        this.frame = null;
        this.start();
    }

    start() {
        const gl = this.canvas.getContext('webgl2', { alpha: true, antialias: true });
        if (!gl) {
            this.canvas.classList.add('metallic-paint--unsupported');
            return;
        }
        const compile = (source, type) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
        };
        const vertex = compile(vertexShader, gl.VERTEX_SHADER),
            fragment = compile(fragmentShader, gl.FRAGMENT_SHADER);
        if (!vertex || !fragment) return;
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
        this.gl = gl;
        this.program = program;
        gl.useProgram(program);
        this.uniforms = Object.fromEntries(
            [
                'u_tex',
                'u_time',
                'u_ratio',
                'u_imgRatio',
                'u_seed',
                'u_scale',
                'u_refract',
                'u_blur',
                'u_liquid',
                'u_bright',
                'u_contrast',
                'u_angle',
                'u_fresnel',
                'u_sharp',
                'u_wave',
                'u_noise',
                'u_chroma',
                'u_distort',
                'u_contour',
                'u_lightColor',
                'u_darkColor',
                'u_tint',
            ].map((name) => [name, gl.getUniformLocation(program, name)])
        );
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const image = new Image();
        image.onload = () => this.upload(processImage(image));
        image.src = this.imageSrc;
    }

    upload(data) {
        const { gl, uniforms: u, options: o } = this;
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        ['TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER'].forEach((key) =>
            gl.texParameteri(gl.TEXTURE_2D, gl[key], gl.LINEAR)
        );
        ['TEXTURE_WRAP_S', 'TEXTURE_WRAP_T'].forEach((key) =>
            gl.texParameteri(gl.TEXTURE_2D, gl[key], gl.CLAMP_TO_EDGE)
        );
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.width, data.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data.data);
        gl.uniform1i(u.u_tex, 0);
        gl.uniform1f(u.u_imgRatio, 1);
        [
            ['u_seed', o.seed],
            ['u_scale', o.scale],
            ['u_refract', o.refraction],
            ['u_blur', o.blur],
            ['u_liquid', o.liquid],
            ['u_bright', o.brightness],
            ['u_contrast', o.contrast],
            ['u_angle', o.angle],
            ['u_fresnel', o.fresnel],
            ['u_sharp', o.patternSharpness],
            ['u_wave', o.waveAmplitude],
            ['u_noise', o.noiseScale],
            ['u_chroma', o.chromaticSpread],
            ['u_distort', o.distortion],
            ['u_contour', o.contour],
        ].forEach(([name, value]) => gl.uniform1f(u[name], value));
        [
            ['u_lightColor', o.lightColor],
            ['u_darkColor', o.darkColor],
            ['u_tint', o.tintColor],
        ].forEach(([name, color]) => gl.uniform3fv(u[name], rgb(color)));
        const render = (time) => {
            const size = Math.min(1000, Math.round(this.canvas.clientWidth * Math.min(devicePixelRatio, 2)));
            if (this.canvas.width !== size) {
                this.canvas.width = this.canvas.height = size;
                gl.viewport(0, 0, size, size);
            }
            gl.uniform1f(u.u_ratio, 1);
            gl.uniform1f(u.u_time, time * o.speed);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            this.frame = requestAnimationFrame(render);
        };
        this.frame = requestAnimationFrame(render);
    }

    destroy() {
        if (this.frame) cancelAnimationFrame(this.frame);
    }
}
