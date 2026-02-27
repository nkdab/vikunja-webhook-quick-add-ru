import {
  addDays,
  addMonths,
  getDaysInMonth,
  isBefore,
  setHours,
  setMilliseconds,
  setMinutes,
  setSeconds,
  startOfDay,
} from 'date-fns';

export interface ParsedTaskPatch {
  due_date?: string;
  priority?: number;
  project_name?: string;
  labels?: string[];
  repeat_after?: number;
  repeat_mode?: 0 | 1 | 3;
  cleaned_title?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_MAP: Record<string, number> = {
  срочно: 5,
  urgent: 5,
  важно: 4,
  important: 4,
};

const WEEKDAY_MAP: Record<string, number> = {
  воскресенье: 0,
  sunday: 0,
  sun: 0,
  понедельник: 1,
  monday: 1,
  mon: 1,
  вторник: 2,
  tuesday: 2,
  tue: 2,
  среду: 3,
  среда: 3,
  wednesday: 3,
  wed: 3,
  четверг: 4,
  thursday: 4,
  thu: 4,
  пятницу: 5,
  пятница: 5,
  friday: 5,
  fri: 5,
  субботу: 6,
  суббота: 6,
  saturday: 6,
  sat: 6,
};

interface TimeHM {
  h: number;
  m: number;
}

const TIME_MARKER_MAP: Record<string, TimeHM> = {
  утром: { h: 8, m: 0 },
  днем: { h: 13, m: 0 },
  днём: { h: 13, m: 0 },
  вечером: { h: 20, m: 0 },
  ночью: { h: 23, m: 0 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function atTime(date: Date, h: number, m: number): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(date, h), m), 0), 0);
}

function atEndOfDay(date: Date): Date {
  return atTime(date, 23, 59);
}

function toIso(date: Date): string {
  return date.toISOString();
}

/**
 * Returns the next occurrence of `targetWeekday` (0=Sun … 6=Sat).
 * If today is already that weekday and `allowToday` is true → return today.
 */
function nextWeekday(from: Date, targetWeekday: number, allowToday = true): Date {
  const fromDay = from.getDay();
  let delta = targetWeekday - fromDay;
  if (delta < 0 || (delta === 0 && !allowToday)) delta += 7;
  return addDays(startOfDay(from), delta);
}

/**
 * Returns a Date set to the given day-of-month in the nearest future.
 */
function nearestDayOfMonth(from: Date, day: number): Date {
  const daysInCurrent = getDaysInMonth(from);
  const clampedDay = Math.min(day, daysInCurrent);
  const candidate = new Date(from.getFullYear(), from.getMonth(), clampedDay);
  if (!isBefore(candidate, startOfDay(from))) return candidate;

  const next = addMonths(from, 1);
  const daysInNext = getDaysInMonth(next);
  return new Date(next.getFullYear(), next.getMonth(), Math.min(day, daysInNext));
}

/**
 * Round a date up to the next full hour.
 */
function ceilToHour(d: Date): Date {
  const m = d.getMinutes();
  const s = d.getSeconds();
  if (m === 0 && s === 0) return d;
  const rounded = new Date(d);
  rounded.setMinutes(0, 0, 0);
  rounded.setHours(rounded.getHours() + 1);
  return rounded;
}

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

export function parseQuickAddRu(text: string, now: Date = new Date()): ParsedTaskPatch | null {
  if (!text || text.trim().length === 0) return null;

  let remaining = text;
  const patch: ParsedTaskPatch = {};

  // ── 1. Priority ──────────────────────────────────────────────────────────
  const prioNumRe = /!([1-5])\b/i;
  const prioWordKeys = Object.keys(PRIORITY_MAP).join('|');
  const prioWordRe = new RegExp(`!(${prioWordKeys})\\b`, 'i');

  const prioNumMatch = remaining.match(prioNumRe);
  const prioWordMatch = remaining.match(prioWordRe);

  if (prioNumMatch) {
    patch.priority = parseInt(prioNumMatch[1] as string, 10);
    remaining = remaining.replace(prioNumRe, ' ');
  } else if (prioWordMatch) {
    const key = (prioWordMatch[1] as string).toLowerCase();
    patch.priority = PRIORITY_MAP[key];
    remaining = remaining.replace(prioWordRe, ' ');
  }

  // ── 2. Project ────────────────────────────────────────────────────────────
  const projectQuotedRe = /\+"([^"]+)"/i;
  const projectSimpleRe = /\+([^\s!+*"]+)/i;

  const quotedProjMatch = remaining.match(projectQuotedRe);
  const simpleProjMatch = remaining.match(projectSimpleRe);

  if (quotedProjMatch) {
    patch.project_name = (quotedProjMatch[1] as string).trim();
    remaining = remaining.replace(projectQuotedRe, ' ');
  } else if (simpleProjMatch) {
    patch.project_name = (simpleProjMatch[1] as string).trim();
    remaining = remaining.replace(projectSimpleRe, ' ');
  }

  // ── 3. Labels ─────────────────────────────────────────────────────────────
  const labelQuotedRe = /\*"([^"]+)"/gi;
  const labelSimpleRe = /\*([^\s!+*"]+)/gi;
  const labels: string[] = [];

  let labelMatch: RegExpExecArray | null;
  while ((labelMatch = labelQuotedRe.exec(remaining)) !== null) {
    labels.push((labelMatch[1] as string).trim());
  }
  remaining = remaining.replace(labelQuotedRe, ' ');

  // Reset lastIndex after replace
  labelSimpleRe.lastIndex = 0;
  while ((labelMatch = labelSimpleRe.exec(remaining)) !== null) {
    labels.push((labelMatch[1] as string).trim());
  }
  remaining = remaining.replace(labelSimpleRe, ' ');

  if (labels.length > 0) patch.labels = labels;

  // ── 4. Explicit time extraction ───────────────────────────────────────────
  // Matches: "в 18:00", "18:30", "в 09:15"  (colon form has priority)
  const explicitTimeRe = /(?:в\s+)?(\d{1,2}):(\d{2})(?!\d)/i;
  // Matches: "в 9" (hour only, no colon)
  const hourOnlyTimeRe = /\bв\s+(\d{1,2})\b(?!:)/i;

  let parsedHour: number | undefined;
  let parsedMinute: number | undefined;

  const explicitTimeMatch = remaining.match(explicitTimeRe);
  const hourOnlyMatch = remaining.match(hourOnlyTimeRe);

  if (explicitTimeMatch) {
    parsedHour = parseInt(explicitTimeMatch[1] as string, 10);
    parsedMinute = parseInt(explicitTimeMatch[2] as string, 10);
    remaining = remaining.replace(explicitTimeRe, ' ');
  } else if (hourOnlyMatch) {
    parsedHour = parseInt(hourOnlyMatch[1] as string, 10);
    parsedMinute = 0;
    remaining = remaining.replace(hourOnlyTimeRe, ' ');
  }

  // ── 5. Time-of-day markers ────────────────────────────────────────────────
  const timeMarkerKeys = Object.keys(TIME_MARKER_MAP).join('|');
  const timeMarkerRe = new RegExp(`\\b(${timeMarkerKeys})\\b`, 'i');

  let markerHour: number | undefined;
  let markerMinute: number | undefined;

  const timeMarkerMatch = remaining.match(timeMarkerRe);
  if (timeMarkerMatch) {
    const key = (timeMarkerMatch[1] as string).toLowerCase();
    const tm = TIME_MARKER_MAP[key];
    if (tm) {
      markerHour = tm.h;
      markerMinute = tm.m;
    }
    remaining = remaining.replace(timeMarkerRe, ' ');
  }

  // Explicit time wins over marker
  const effectiveHour = parsedHour ?? markerHour;
  const effectiveMinute = parsedMinute ?? markerMinute;

  function applyTime(base: Date): Date {
    if (effectiveHour !== undefined && effectiveMinute !== undefined) {
      return atTime(base, effectiveHour, effectiveMinute);
    }
    return atEndOfDay(base);
  }

  // ── 6. Recurrence ─────────────────────────────────────────────────────────
  const everyDayRe = /\bкаждый\s+день\b/i;
  const everyWeekRe = /\bкаждую\s+неделю\b/i;
  const everyMonthRe = /\bкаждый\s+месяц\b/i;
  const everyHourRe = /\bкаждый\s+час\b/i;
  const everyNHoursRe = /\bкаждые\s+(\d+)\s+часов?\b/i;
  const weekdayKeys = Object.keys(WEEKDAY_MAP).join('|');
  const everyWeekdayRe = new RegExp(
    `\\b(?:каждый|каждую|каждое)\\s+(${weekdayKeys})\\b`,
    'i'
  );
  const everyDayOfMonthRe = /\bкаждое\s+(\d{1,2})\s+числ[оа]?\b/i;
  const secondDayOfWeekRe = /\bвторой\s+день\s+каждой\s+недели\b/i;

  if (everyDayRe.test(remaining)) {
    patch.repeat_after = 86400;
    patch.repeat_mode = 0;
    remaining = remaining.replace(everyDayRe, ' ');
  } else if (everyWeekRe.test(remaining)) {
    patch.repeat_after = 604800;
    patch.repeat_mode = 0;
    remaining = remaining.replace(everyWeekRe, ' ');
  } else if (everyMonthRe.test(remaining)) {
    patch.repeat_mode = 1;
    remaining = remaining.replace(everyMonthRe, ' ');
  } else if (everyHourRe.test(remaining)) {
    patch.repeat_after = 3600;
    patch.repeat_mode = 0;
    remaining = remaining.replace(everyHourRe, ' ');
  } else {
    const nHoursMatch = remaining.match(everyNHoursRe);
    if (nHoursMatch) {
      const n = parseInt(nHoursMatch[1] as string, 10);
      patch.repeat_after = 3600 * n;
      patch.repeat_mode = 0;
      remaining = remaining.replace(everyNHoursRe, ' ');
    }
  }

  if (secondDayOfWeekRe.test(remaining) && patch.due_date === undefined) {
    if (patch.repeat_after === undefined && patch.repeat_mode === undefined) {
      patch.repeat_after = 604800;
      patch.repeat_mode = 0;
    }
    const base = nextWeekday(startOfDay(now), 2, true);
    patch.due_date = toIso(applyTime(base));
    remaining = remaining.replace(secondDayOfWeekRe, ' ');
  }

  const weekdayRecurMatch = !patch.due_date ? remaining.match(everyWeekdayRe) : null;
  if (weekdayRecurMatch) {
    const dayKey = (weekdayRecurMatch[1] as string).toLowerCase();
    const targetDay = WEEKDAY_MAP[dayKey];
    if (targetDay !== undefined) {
      if (patch.repeat_after === undefined && patch.repeat_mode === undefined) {
        patch.repeat_after = 604800;
        patch.repeat_mode = 0;
      }
      const base = nextWeekday(startOfDay(now), targetDay, true);
      patch.due_date = toIso(applyTime(base));
    }
    remaining = remaining.replace(everyWeekdayRe, ' ');
  }

  const dayOfMonthMatch = !patch.due_date ? remaining.match(everyDayOfMonthRe) : null;
  if (dayOfMonthMatch) {
    const day = parseInt(dayOfMonthMatch[1] as string, 10);
    if (patch.repeat_after === undefined && patch.repeat_mode === undefined) {
      patch.repeat_mode = 1;
    }
    const base = nearestDayOfMonth(startOfDay(now), day);
    patch.due_date = toIso(applyTime(base));
    remaining = remaining.replace(everyDayOfMonthRe, ' ');
  }

  // ── 7. Date expressions ───────────────────────────────────────────────────
  const todayRe = /\b(сегодня|today)\b/i;
  const tomorrowRe = /\b(завтра|tomorrow)\b/i;
  const dayAfterTomorrowRe = /\bпослезавтра\b/i;
  const inNDaysRe = /\bчерез\s+(\d+)\s+дн[еёяй]?\b/i;
  const weekdayOnceRe = new RegExp(
    `\\b(?:в\\s+)?(${weekdayKeys})\\b`,
    'i'
  );

  if (patch.due_date === undefined) {
    if (todayRe.test(remaining)) {
      patch.due_date = toIso(applyTime(startOfDay(now)));
      remaining = remaining.replace(todayRe, ' ');
    } else if (tomorrowRe.test(remaining)) {
      patch.due_date = toIso(applyTime(startOfDay(addDays(now, 1))));
      remaining = remaining.replace(tomorrowRe, ' ');
    } else if (dayAfterTomorrowRe.test(remaining)) {
      patch.due_date = toIso(applyTime(startOfDay(addDays(now, 2))));
      remaining = remaining.replace(dayAfterTomorrowRe, ' ');
    } else {
      const nDaysMatch = remaining.match(inNDaysRe);
      if (nDaysMatch) {
        const n = parseInt(nDaysMatch[1] as string, 10);
        patch.due_date = toIso(applyTime(startOfDay(addDays(now, n))));
        remaining = remaining.replace(inNDaysRe, ' ');
      } else {
        const weekdayMatch = remaining.match(weekdayOnceRe);
        if (weekdayMatch) {
          const dayKey = (weekdayMatch[1] as string).toLowerCase();
          const targetDay = WEEKDAY_MAP[dayKey];
          if (targetDay !== undefined) {
            patch.due_date = toIso(applyTime(nextWeekday(startOfDay(now), targetDay, false)));
          }
          remaining = remaining.replace(weekdayOnceRe, ' ');
        }
      }
    }
  }

  // ── 8. Time-only (no date matched) ───────────────────────────────────────
  if (patch.due_date === undefined && effectiveHour !== undefined && effectiveMinute !== undefined) {
    const candidate = atTime(startOfDay(now), effectiveHour, effectiveMinute);
    if (isBefore(candidate, now)) {
      patch.due_date = toIso(atTime(startOfDay(addDays(now, 1)), effectiveHour, effectiveMinute));
    } else {
      patch.due_date = toIso(candidate);
    }
  }

  // ── 9. Hourly repeat: set due_date if still missing ───────────────────────
  if (
    patch.repeat_after !== undefined &&
    patch.repeat_after < 86400 &&
    patch.due_date === undefined
  ) {
    const base = ceilToHour(now);
    patch.due_date = toIso(base);
  }

  // ── 10. Monthly repeat fallback: use today if no date ────────────────────
  if (patch.repeat_mode === 1 && patch.due_date === undefined) {
    const candidate = applyTime(startOfDay(now));
    if (isBefore(candidate, now)) {
      patch.due_date = toIso(applyTime(startOfDay(addDays(now, 1))));
    } else {
      patch.due_date = toIso(candidate);
    }
  }

  // ── 11. Build cleaned_title ───────────────────────────────────────────────
  const cleaned = remaining.replace(/\s{2,}/g, ' ').trim();

  if (cleaned.length > 0 && cleaned.toLowerCase() !== text.toLowerCase().trim()) {
    patch.cleaned_title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Return null if nothing was enriched
  const hasMeaningfulPatch =
    patch.due_date !== undefined ||
    patch.priority !== undefined ||
    patch.project_name !== undefined ||
    (patch.labels !== undefined && patch.labels.length > 0) ||
    patch.repeat_after !== undefined ||
    patch.repeat_mode !== undefined;

  if (!hasMeaningfulPatch && patch.cleaned_title === undefined) return null;

  return patch;
}
