/**
 * Gradient Distortion — Pure math, no DOM
 * Layered sine harmonics for organic gradient animation
 */

class GradientDistortion {
  constructor(config) {
    this.config = config;
    this.seed = config.distortionSeed || 42;
    this.harmonics = [];
    this.buildHarmonics();
  }

  buildHarmonics() {
    const complexity = this.config.distortionComplexity || 3;
    const speed = this.config.distortionSpeed || 0.5;
    const intensity = this.config.distortionIntensity || 0.3;

    for (let i = 0; i < complexity; i++) {
      const frequency = 0.1 + (i / complexity) * 2.0;
      const amplitude = intensity / complexity;
      const phaseOffset = (this.seed + i * 137.508) % (2 * Math.PI);

      this.harmonics.push({
        frequency: frequency * speed,
        amplitude,
        phaseOffset,
        axis: i % 2 === 0 ? 'x' : 'y'
      });
    }
  }

  sample(elapsed) {
    const stops = this.computeStops(elapsed);
    const angle = this.computeAngle(elapsed);

    return { stops, angle };
  }

  computeStops(elapsed) {
    const startDist = this.config.linearGradientStartColorDistance || 0;
    const endDist = this.config.linearGradientEndColorDistance || 1;
    const range = endDist - startDist;
    const smoothness = this.config.distortionSmoothness || 0.7;

    const baseStops = [
      { offset: startDist, color: this.config.startColor },
      { offset: endDist, color: this.config.endColor }
    ];

    const stops = [...baseStops];

    // Insert intermediate stops at harmonic-driven positions
    for (let i = 1; i <= Math.max(2, Math.floor(this.config.distortionComplexity / 2)); i++) {
      const position = startDist + (i / (Math.max(2, Math.floor(this.config.distortionComplexity / 2)) + 1)) * range;
      const harmonicVal = this.harmonicSum(position, elapsed);
      const t = 0.5 + harmonicVal * smoothness * 0.5;
      const clampedT = Math.max(0, Math.min(1, t));

      const color = this.lerpColor(
        this.parseColor(this.config.startColor),
        this.parseColor(this.config.endColor),
        clampedT
      );

      stops.push({ offset: position, color: this.colorToCSS(color) });
    }

    return stops.sort((a, b) => a.offset - b.offset);
  }

  computeAngle(elapsed) {
    const base = this.config.linearGradientAngle || 135;
    const wobble = this.harmonicSum(0.5, elapsed) * 15;
    return base + wobble;
  }

  harmonicSum(position, elapsed) {
    let sum = 0;
    for (const harmonic of this.harmonics) {
      const phase = harmonic.frequency * elapsed * 2 * Math.PI + harmonic.phaseOffset;
      const posComponent = position * Math.PI;
      sum += harmonic.amplitude * Math.sin(phase + posComponent);
    }
    return Math.max(-1, Math.min(1, sum));
  }

  lerpColor(colorA, colorB, t) {
    const result = {
      r: Math.round(colorA.r + (colorB.r - colorA.r) * t),
      g: Math.round(colorA.g + (colorB.g - colorA.g) * t),
      b: Math.round(colorA.b + (colorB.b - colorA.b) * t)
    };

    // Interpolate alpha if either color has it
    if (colorA.a !== undefined || colorB.a !== undefined) {
      const alphaA = colorA.a !== undefined ? colorA.a : 1;
      const alphaB = colorB.a !== undefined ? colorB.a : 1;
      result.a = alphaA + (alphaB - alphaA) * t;
    }

    return result;
  }

  colorToCSS(rgbObj) {
    if (rgbObj.a !== undefined) {
      return `rgba(${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b}, ${rgbObj.a})`;
    }
    return `rgb(${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b})`;
  }

  parseColor(colorStr) {
    if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1);
      const num = parseInt(hex, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    }

    // Handle rgba(r, g, b, a)
    const rgbaMatch = colorStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1]),
        g: parseInt(rgbaMatch[2]),
        b: parseInt(rgbaMatch[3]),
        a: parseFloat(rgbaMatch[4])
      };
    }

    // Handle rgb(r, g, b)
    const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3])
      };
    }

    return { r: 0, g: 0, b: 0 };
  }
}

window.GradientDistortion = GradientDistortion;
