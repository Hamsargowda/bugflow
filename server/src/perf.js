/* ---------------------------------------------------------------------- */
/*  Milestone 4 — lightweight in-process response-time tracking.           */
/*  A rolling window of the last N request durations, so the              */
/*  system-performance endpoint can report a real "avg response time"     */
/*  instead of a hardcoded number. Deliberately simple (no external       */
/*  metrics service) — resets on restart, which is fine for a single-     */
/*  instance student project.                                             */
/* ---------------------------------------------------------------------- */

const WINDOW_SIZE = 200;
const samples = [];

export function recordResponseTime(ms) {
  samples.push(ms);
  if (samples.length > WINDOW_SIZE) samples.shift();
}

/** Rolling average response time in ms, or null before any request has completed. */
export function avgResponseTimeMs() {
  if (!samples.length) return null;
  const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  return Math.round(avg);
}

/** Test-only helper to reset state between test files. */
export function _resetForTests() {
  samples.length = 0;
}
