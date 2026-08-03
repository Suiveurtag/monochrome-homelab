// Verbatim JavaScript port of Spicy Lyrics src/modules/Spring.ts.
// Copyright Spikerko and contributors, AGPL-3.0.
// Upstream revision: cc45160facbebbe6c872a8796d339c0602d58928
// Original solver: https://github.com/Fraktality/spr (MIT).

const SLEEP_OFFSET_SQ_LIMIT = (1 / 3840) ** 2;
const SLEEP_VELOCITY_SQ_LIMIT = 1e-2 ** 2;
const EPS = 1e-5;

const pi = Math.PI;
const exp = Math.exp;
const sin = Math.sin;
const cos = Math.cos;
const sqrt = Math.sqrt;

export class Spring {
    constructor(startPosition, frequency, dampingRatio, goal) {
        this.d = dampingRatio;
        this.f = frequency;
        this.g = goal ?? startPosition;
        this.p = startPosition;
        this.v = 0;
    }

    Step(dt) {
        const d = this.d;
        const f = this.f * (2 * pi);
        const g = this.g;
        let p = this.p;
        let v = this.v;

        if (d === 1) {
            const q = exp(-f * dt);
            const w = dt * q;
            const c0 = q + w * f;
            const c2 = q - w * f;
            const c3 = w * f * f;
            const o = p - g;
            p = o * c0 + v * w + g;
            v = v * c2 - o * c3;
        } else if (d < 1) {
            const q = exp(-d * f * dt);
            const c = sqrt(1 - d * d);
            const i = cos(dt * f * c);
            const j = sin(dt * f * c);

            let z;
            if (c > EPS) {
                z = j / c;
            } else {
                const a = dt * f;
                z = a + ((a * a * (c * c) * (c * c)) / 20 - c * c) * ((a * a * a) / 6);
            }

            let y;
            if (f * c > EPS) {
                y = j / (f * c);
            } else {
                const b = f * c;
                y = dt + ((dt * dt * (b * b) * (b * b)) / 20 - b * b) * ((dt * dt * dt) / 6);
            }

            const o = p - g;
            p = (o * (i + z * d) + v * y) * q + g;
            v = (v * (i - z * d) - o * (z * f)) * q;
        } else {
            const c = sqrt(d * d - 1);
            const r1 = -f * (d + c);
            const r2 = -f * (d - c);
            const ec1 = exp(r1 * dt);
            const ec2 = exp(r2 * dt);
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

    CanSleep() {
        if (this.v * this.v > SLEEP_VELOCITY_SQ_LIMIT) return false;
        const offset = this.p - this.g;
        if (offset * offset > SLEEP_OFFSET_SQ_LIMIT) return false;
        return true;
    }

    GetGoal() {
        return this.g;
    }

    SetGoal(goal, replacePosition) {
        this.g = goal;
        if (replacePosition) {
            this.p = goal;
            this.v = 0;
        }
    }

    SetDampingRatio(dampingRatio) {
        this.d = dampingRatio;
    }

    SetFrequency(frequency) {
        this.f = frequency;
    }
}
