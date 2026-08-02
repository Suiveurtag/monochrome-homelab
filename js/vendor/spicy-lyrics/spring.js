/*
 * Adapted from Spicy Lyrics (https://github.com/spikerko/spicy-lyrics/)
 * Upstream commit: cc45160facbebbe6c872a8796d339c0602d58928
 * SPDX-License-Identifier: AGPL-3.0-only
 * Spring originally based on Fraktality/spr (MIT).
 */

const SLEEP_OFFSET_SQ_LIMIT = (1 / 3840) ** 2;
const SLEEP_VELOCITY_SQ_LIMIT = 1e-4;
const EPS = 1e-5;

export class Spring {
    constructor(startPosition, frequency, dampingRatio, goal = startPosition) {
        this.d = dampingRatio;
        this.f = frequency;
        this.g = goal;
        this.p = startPosition;
        this.v = 0;
    }

    step(dt) {
        const d = this.d;
        const f = this.f * 2 * Math.PI;
        const g = this.g;
        let p = this.p;
        let v = this.v;

        if (d === 1) {
            const q = Math.exp(-f * dt);
            const w = dt * q;
            const c0 = q + w * f;
            const c2 = q - w * f;
            const c3 = w * f * f;
            const o = p - g;
            p = o * c0 + v * w + g;
            v = v * c2 - o * c3;
        } else if (d < 1) {
            const q = Math.exp(-d * f * dt);
            const c = Math.sqrt(1 - d * d);
            const i = Math.cos(dt * f * c);
            const j = Math.sin(dt * f * c);
            const z = c > EPS ? j / c : dt * f;
            const y = f * c > EPS ? j / (f * c) : dt;
            const o = p - g;
            p = (o * (i + z * d) + v * y) * q + g;
            v = (v * (i - z * d) - o * z * f) * q;
        } else {
            const c = Math.sqrt(d * d - 1);
            const r1 = -f * (d + c);
            const r2 = -f * (d - c);
            const ec1 = Math.exp(r1 * dt);
            const ec2 = Math.exp(r2 * dt);
            const o = p - g;
            const co2 = (v - o * r1) / (2 * f * c);
            const co1 = ec1 * (o - co2);
            p = co1 + co2 * ec2 + g;
            v = co1 * r1 + co2 * ec2 * r2;
        }

        this.p = p;
        this.v = v;
        return p;
    }

    canSleep() {
        if (this.v * this.v > SLEEP_VELOCITY_SQ_LIMIT) return false;
        const offset = this.p - this.g;
        return offset * offset <= SLEEP_OFFSET_SQ_LIMIT;
    }

    setGoal(goal, replacePosition = false) {
        this.g = goal;
        if (replacePosition) {
            this.p = goal;
            this.v = 0;
        }
    }
}
