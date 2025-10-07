// components/settings/audio/volume/VolumeMath.ts
export const MIN_DB = -60;
export const MAX_DB = -5;

export const MIN_GAIN = Math.pow(10, MIN_DB / 20); // ≈ 0.001
export const MAX_GAIN = Math.pow(10, MAX_DB / 20); // ≈ 0.562

/** Easing: easeInSine (0..1 -> 0..1) */
export function easeInSine(u01: number): number {
  const u = Math.max(0, Math.min(1, u01));
  return 1 - Math.cos((u * Math.PI) / 2);
}

/** Slider (0..1) -> linear gain using eased curve and -60..-5 dB range */
export function sliderToGain(u01: number): number {
  const t = easeInSine(u01);
  return MIN_GAIN + (MAX_GAIN - MIN_GAIN) * t;
}

/** Inverse of sliderToGain (linear gain -> slider 0..1) */
export function gainToSlider(gain: number): number {
  const g = Math.max(MIN_GAIN, Math.min(MAX_GAIN, gain));
  const t = (g - MIN_GAIN) / (MAX_GAIN - MIN_GAIN); // 0..1
  // invert easeInSine: t = 1 - cos(theta)  =>  theta = arccos(1 - t)
  // u = 2*theta/π
  const theta = Math.acos(1 - t);
  return (2 * theta) / Math.PI;
}

/** Pretty dB from gain */
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(1e-6, gain));
}
