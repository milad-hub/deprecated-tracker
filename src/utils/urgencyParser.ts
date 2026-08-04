import { DeprecationSchedule, DeprecationUrgency } from "../interfaces";

const SINCE_DATE = /\bsince\b[^.\n]{0,20}?(\d{4}-\d{2}-\d{2})\b/i;
const SINCE_VERSION = /\bsince\b(?:\s+version)?\s+v?(\d+(?:\.\d+)*)\b/i;
const REMOVAL_DATE =
  /\b(?:remove[ds]?|removal|removing)\b[^.\n]{0,24}?(\d{4}-\d{2}-\d{2})\b/i;
const REMOVAL_VERSION =
  /\b(?:remove[ds]?|removal|removing)\b[^.\n]{0,24}?\bv?(\d+(?:\.\d+)*)\b/i;

export const URGENCY_RANK: Record<DeprecationUrgency, number> = {
  removed: 3,
  scheduled: 2,
  announced: 1,
};

export function parseDeprecationSchedule(
  reason?: string,
  now: Date = new Date(),
): DeprecationSchedule | undefined {
  if (!reason) return undefined;

  const removalDate = REMOVAL_DATE.exec(reason)?.[1];
  const removalVersion = removalDate
    ? undefined
    : REMOVAL_VERSION.exec(reason)?.[1];
  const sinceDate = SINCE_DATE.exec(reason)?.[1];
  const sinceVersion = sinceDate ? undefined : SINCE_VERSION.exec(reason)?.[1];

  const urgency = resolveUrgency(
    now,
    removalDate,
    removalVersion,
    sinceDate || sinceVersion,
  );
  if (!urgency) return undefined;

  const schedule: DeprecationSchedule = { urgency };
  if (sinceVersion) schedule.sinceVersion = sinceVersion;
  if (sinceDate) schedule.sinceDate = sinceDate;
  if (removalVersion) schedule.removalVersion = removalVersion;
  if (removalDate) schedule.removalDate = removalDate;
  return schedule;
}

function resolveUrgency(
  now: Date,
  removalDate?: string,
  removalVersion?: string,
  since?: string,
): DeprecationUrgency | undefined {
  if (removalDate) {
    const due = Date.parse(`${removalDate}T00:00:00Z`);
    if (!Number.isNaN(due)) {
      return due <= now.getTime() ? "removed" : "scheduled";
    }
  }
  if (removalVersion) return "scheduled";
  if (since) return "announced";
  return undefined;
}
