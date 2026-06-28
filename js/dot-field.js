const TWO_PI = Math.PI * 2;

const DEFAULTS = {
    dotRadius: 1.5,
    dotSpacing: 14,
    cursorRadius: 500,
    cursorForce: 0.1,
    bulgeOnly: true,
    bulgeStrength: 67,
    glowRadius: 160,
    sparkle: false,
    waveAmplitude: 0,
    gradientFrom: '#8300ff',
    gradientTo: '#B497CF',
    glowColor: '#120F17',
};

export function initializeDotField(container, options = {}) {
    if (!container || container.dataset.initialized === 'true') return () => {};
    container.dataset.initialized = 'true';

    const config = { ...DEFAULTS, ...options };
    const canvas = document.createElement('canvas');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const radialGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const gradientId = `dot-field-glow-${Math.random().toString(36).slice(2, 9)}`;

    radialGradient.id = gradientId;
    for (const [offset, color] of [
        ['0%', config.glowColor],
        ['100%', 'transparent'],
    ]) {
        const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        radialGradient.append(stop);
    }

    defs.append(radialGradient);
    glow.setAttribute('cx', '-9999');
    glow.setAttribute('cy', '-9999');
    glow.setAttribute('r', String(config.glowRadius));
    glow.setAttribute('fill', `url(#${gradientId})`);
    glow.style.opacity = '0';
    svg.append(defs, glow);
    container.append(canvas, svg);

    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const dots = [];
    const pointer = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 };
    const size = { width: 0, height: 0, offsetX: 0, offsetY: 0 };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let engagement = 0;
    let glowOpacity = 0;
    let animationFrame = 0;
    let resizeTimer = 0;

    function buildDots() {
        dots.length = 0;
        const step = config.dotRadius + config.dotSpacing;
        const columns = Math.floor(size.width / step);
        const rows = Math.floor(size.height / step);
        const paddingX = (size.width % step) / 2;
        const paddingY = (size.height % step) / 2;

        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const anchorX = paddingX + column * step + step / 2;
                const anchorY = paddingY + row * step + step / 2;
                dots.push({ anchorX, anchorY, smoothX: anchorX, smoothY: anchorY, velocityX: 0, velocityY: 0 });
            }
        }
    }

    function resize() {
        const rect = container.getBoundingClientRect();
        size.width = rect.width;
        size.height = rect.height;
        size.offsetX = rect.left + window.scrollX;
        size.offsetY = rect.top + window.scrollY;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildDots();
    }

    function scheduleResize() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(resize, 100);
    }

    function updatePointer(event) {
        pointer.x = event.pageX - size.offsetX;
        pointer.y = event.pageY - size.offsetY;
    }

    function resetPointer() {
        pointer.x = -9999;
        pointer.y = -9999;
        pointer.speed = 0;
    }

    function updatePointerSpeed() {
        const distance = Math.hypot(pointer.prevX - pointer.x, pointer.prevY - pointer.y);
        pointer.speed += (distance - pointer.speed) * 0.5;
        if (pointer.speed < 0.001) pointer.speed = 0;
        pointer.prevX = pointer.x;
        pointer.prevY = pointer.y;
    }

    function draw() {
        frame++;
        const time = frame * 0.02;
        const targetEngagement = reducedMotion ? 0 : Math.min(pointer.speed / 5, 1);
        engagement += (targetEngagement - engagement) * 0.06;
        if (engagement < 0.001) engagement = 0;
        glowOpacity += (engagement - glowOpacity) * 0.08;

        glow.setAttribute('cx', String(pointer.x));
        glow.setAttribute('cy', String(pointer.y));
        glow.style.opacity = String(glowOpacity);

        ctx.clearRect(0, 0, size.width, size.height);
        const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
        gradient.addColorStop(0, config.gradientFrom);
        gradient.addColorStop(1, config.gradientTo);
        ctx.fillStyle = gradient;
        ctx.beginPath();

        const cursorRadiusSquared = config.cursorRadius * config.cursorRadius;
        const radius = config.dotRadius / 2;
        for (let index = 0; index < dots.length; index++) {
            const dot = dots[index];
            const dx = pointer.x - dot.anchorX;
            const dy = pointer.y - dot.anchorY;
            const distanceSquared = dx * dx + dy * dy;

            if (distanceSquared < cursorRadiusSquared && engagement > 0.01) {
                const distance = Math.sqrt(distanceSquared);
                if (config.bulgeOnly) {
                    const falloff = 1 - distance / config.cursorRadius;
                    const push = falloff * falloff * config.bulgeStrength * engagement;
                    const angle = Math.atan2(dy, dx);
                    dot.smoothX += (dot.anchorX - Math.cos(angle) * push - dot.smoothX) * 0.15;
                    dot.smoothY += (dot.anchorY - Math.sin(angle) * push - dot.smoothY) * 0.15;
                } else {
                    const angle = Math.atan2(dy, dx);
                    const movement = (500 / Math.max(distance, 1)) * (pointer.speed * config.cursorForce);
                    dot.velocityX -= Math.cos(angle) * movement;
                    dot.velocityY -= Math.sin(angle) * movement;
                }
            } else if (config.bulgeOnly) {
                dot.smoothX += (dot.anchorX - dot.smoothX) * 0.1;
                dot.smoothY += (dot.anchorY - dot.smoothY) * 0.1;
            }

            if (!config.bulgeOnly) {
                dot.velocityX *= 0.9;
                dot.velocityY *= 0.9;
                dot.smoothX += (dot.anchorX + dot.velocityX - dot.smoothX) * 0.1;
                dot.smoothY += (dot.anchorY + dot.velocityY - dot.smoothY) * 0.1;
            }

            let drawX = dot.smoothX;
            let drawY = dot.smoothY;
            if (config.waveAmplitude > 0) {
                drawY += Math.sin(dot.anchorX * 0.03 + time) * config.waveAmplitude;
                drawX += Math.cos(dot.anchorY * 0.03 + time * 0.7) * config.waveAmplitude * 0.5;
            }

            const sparkleRadius =
                config.sparkle && (((index * 2654435761) ^ (frame >> 3)) >>> 0) % 100 < 3 ? radius * 1.8 : radius;
            ctx.moveTo(drawX + sparkleRadius, drawY);
            ctx.arc(drawX, drawY, sparkleRadius, 0, TWO_PI);
        }

        ctx.fill();
        animationFrame = window.requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('pointermove', updatePointer, { passive: true });
    document.addEventListener('mouseleave', resetPointer);
    const speedInterval = window.setInterval(updatePointerSpeed, 20);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
        window.cancelAnimationFrame(animationFrame);
        window.clearInterval(speedInterval);
        window.clearTimeout(resizeTimer);
        window.removeEventListener('resize', scheduleResize);
        window.removeEventListener('pointermove', updatePointer);
        document.removeEventListener('mouseleave', resetPointer);
        container.replaceChildren();
        delete container.dataset.initialized;
    };
}
