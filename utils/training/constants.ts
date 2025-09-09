// utils/training/constants.ts
export const LEAD_IN_SEC = 1.5;
export const TRAIN_LEAD_IN_SEC = 1.0; // training overlay lead-in
export const CONF_THRESHOLD = 0.5;
export const MIN_NOISE_FRAMES = 10;

export const RECORD_SEC = 8;
export const REST_SEC = 8;
/** 8 notes * 0.5s = 4s notes inside the 8s window */
export const NOTE_DUR_SEC = 0.5;

export const MAX_TAKES = 24;
export const MAX_SESSION_SEC = 15 * 60;

export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "dev";
