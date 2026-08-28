/**
 * data/pilotConfig.ts
 *
 * Single source of truth for how long a pilot run is. Everything that
 * cares about pilot length (currently just the stats screen) reads
 * this instead of hardcoding a week count, so extending the pilot to
 * 11 weeks (or any other length) later is a one-line change here.
 */

export const PILOT_DURATION_WEEKS = 8;
