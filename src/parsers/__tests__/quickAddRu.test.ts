/**
 * Tests for the Quick Add RU parser.
 *
 * IMPORTANT: Run with TZ=UTC (done automatically via npm test / cross-env).
 * All expected ISO strings assume UTC === local time.
 *
 * Reference point: Wednesday 2024-01-10 12:00:00 UTC
 *   - Mon Jan 15, Tue Jan 16, Wed Jan 17 (skip today), Thu Jan 11
 *
 * To add a new language parser, create a sibling test file:
 *   src/parsers/__tests__/quickAddEn.test.ts  (or quickAddDe, etc.)
 * and follow the same describe structure.
 */

import { describe, expect, it } from 'vitest';
import { parseQuickAddRu } from '../quickAddRu.js';

// ─── Reference date: Wednesday 2024-01-10 12:00:00 UTC ───────────────────────
const NOW = new Date('2024-01-10T12:00:00.000Z');

// ─── Shorthand ISO builders ───────────────────────────────────────────────────
const d = (y: number, mo: number, day: number, h: number, m: number) =>
  new Date(Date.UTC(y, mo - 1, day, h, m, 0, 0)).toISOString();

// Common expected values
const TODAY_END    = d(2024, 1, 10, 23, 59); // Jan 10 23:59
const TOMORROW_END = d(2024, 1, 11, 23, 59); // Jan 11 23:59
const D2_END       = d(2024, 1, 12, 23, 59); // Jan 12 23:59
const D3_END       = d(2024, 1, 13, 23, 59); // Jan 13 23:59
const MON_END      = d(2024, 1, 15, 23, 59); // next Mon Jan 15
const TUE_END      = d(2024, 1, 16, 23, 59); // next Tue Jan 16
const WED_END      = d(2024, 1, 17, 23, 59); // next Wed Jan 17 (skip today)
const THU_END      = d(2024, 1, 11, 23, 59); // next Thu Jan 11 (tomorrow)

// ─────────────────────────────────────────────────────────────────────────────

describe('parseQuickAddRu', () => {

  // ── Null / no-op ──────────────────────────────────────────────────────────

  describe('null / no-op cases', () => {
    it('returns null for empty string', () => {
      expect(parseQuickAddRu('', NOW)).toBeNull();
    });

    it('returns null for plain text without markers', () => {
      expect(parseQuickAddRu('купить молоко', NOW)).toBeNull();
    });

    it('returns null for whitespace only', () => {
      expect(parseQuickAddRu('   ', NOW)).toBeNull();
    });
  });

  // ── Absolute dates (RU) ────────────────────────────────────────────────────

  describe('absolute dates — Russian', () => {
    it('сегодня → today 23:59', () => {
      const r = parseQuickAddRu('сегодня купить молоко', NOW);
      expect(r?.due_date).toBe(TODAY_END);
    });

    it('завтра → tomorrow 23:59', () => {
      const r = parseQuickAddRu('завтра купить молоко', NOW);
      expect(r?.due_date).toBe(TOMORROW_END);
    });

    it('послезавтра → +2 days 23:59', () => {
      const r = parseQuickAddRu('послезавтра забрать посылку', NOW);
      expect(r?.due_date).toBe(D2_END);
    });

    it('через 3 дня → +3 days 23:59', () => {
      const r = parseQuickAddRu('через 3 дня позвонить', NOW);
      expect(r?.due_date).toBe(D3_END);
    });

    it('через 1 день → tomorrow 23:59', () => {
      const r = parseQuickAddRu('через 1 день встреча', NOW);
      expect(r?.due_date).toBe(TOMORROW_END);
    });
  });

  // ── Absolute dates (EN) ────────────────────────────────────────────────────

  describe('absolute dates — English keywords', () => {
    it('today → today 23:59', () => {
      const r = parseQuickAddRu('today buy milk', NOW);
      expect(r?.due_date).toBe(TODAY_END);
    });

    it('tomorrow → tomorrow 23:59', () => {
      const r = parseQuickAddRu('tomorrow meeting', NOW);
      expect(r?.due_date).toBe(TOMORROW_END);
    });
  });

  // ── Weekdays ───────────────────────────────────────────────────────────────

  describe('weekdays (once)', () => {
    it('в понедельник → next Mon Jan 15', () => {
      const r = parseQuickAddRu('в понедельник встреча', NOW);
      expect(r?.due_date).toBe(MON_END);
    });

    it('во вторник → next Tue Jan 16', () => {
      const r = parseQuickAddRu('во вторник сходить на встречу', NOW);
      expect(r?.due_date).toBe(TUE_END);
    });

    it('в среду → next Wed Jan 17 (skips today)', () => {
      // today is Wednesday → must jump to next week
      const r = parseQuickAddRu('в среду подготовить отчёт', NOW);
      expect(r?.due_date).toBe(WED_END);
    });

    it('в четверг → Jan 11 (nearest future)', () => {
      const r = parseQuickAddRu('в четверг обед', NOW);
      expect(r?.due_date).toBe(THU_END);
    });

    it('в пятницу → Jan 12', () => {
      const r = parseQuickAddRu('в пятницу дедлайн', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 12, 23, 59));
    });

    it('в субботу → Jan 13', () => {
      const r = parseQuickAddRu('в субботу спортзал', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 13, 23, 59));
    });
  });

  // ── Explicit time ──────────────────────────────────────────────────────────

  describe('explicit time', () => {
    it('в 18:00 → today 18:00 (still ahead)', () => {
      const r = parseQuickAddRu('в 18:00 позвонить', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 10, 18, 0));
    });

    it('в 9 → tomorrow 09:00 (already past)', () => {
      const r = parseQuickAddRu('в 9 позвонить', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 11, 9, 0));
    });

    it('18:30 (no "в") → today 18:30', () => {
      const r = parseQuickAddRu('18:30 встреча', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 10, 18, 30));
    });

    it('в 09:15 → tomorrow 09:15 (already past)', () => {
      const r = parseQuickAddRu('в 09:15 планёрка', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 11, 9, 15));
    });
  });

  // ── Time-of-day markers ────────────────────────────────────────────────────

  describe('time-of-day markers', () => {
    it('утром → tomorrow 08:00 (08:00 already past)', () => {
      const r = parseQuickAddRu('утром зарядка', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 11, 8, 0));
    });

    it('днем → today 13:00 (still ahead)', () => {
      const r = parseQuickAddRu('днем обед', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 10, 13, 0));
    });

    it('днём → today 13:00 (ё variant)', () => {
      const r = parseQuickAddRu('днём встреча', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 10, 13, 0));
    });

    it('вечером → today 20:00', () => {
      const r = parseQuickAddRu('вечером позвонить маме', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 10, 20, 0));
    });

    it('ночью → today 23:00', () => {
      const r = parseQuickAddRu('ночью проверить сервер', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 10, 23, 0));
    });
  });

  // ── Combined date + time ───────────────────────────────────────────────────

  describe('combined date + time', () => {
    it('завтра утром → tomorrow 08:00', () => {
      const r = parseQuickAddRu('завтра утром позвонить', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 11, 8, 0));
    });

    it('завтра вечером → tomorrow 20:00', () => {
      const r = parseQuickAddRu('завтра вечером встреча', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 11, 20, 0));
    });

    it('сегодня в 18:00 → today 18:00', () => {
      const r = parseQuickAddRu('сегодня в 18:00 позвонить', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 10, 18, 0));
    });

    it('послезавтра в 16:00 → Jan 12 16:00', () => {
      const r = parseQuickAddRu('послезавтра в 16:00 доставка', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 12, 16, 0));
    });

    it('в понедельник вечером → Jan 15 20:00', () => {
      const r = parseQuickAddRu('в понедельник вечером собрание', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 15, 20, 0));
    });

    it('во вторник в 18:00 → Jan 16 18:00', () => {
      const r = parseQuickAddRu('во вторник в 18:00 стоматолог', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 16, 18, 0));
    });

    it('explicit time overrides time marker', () => {
      // "вечером" = 20:00, but "в 15:00" wins
      const r = parseQuickAddRu('завтра в 15:00 вечером встреча', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 11, 15, 0));
    });

    it('date-only defaults to 23:59', () => {
      const r = parseQuickAddRu('завтра задача без времени', NOW);
      expect(r?.due_date).toBe(TOMORROW_END);
    });
  });

  // ── Priority ───────────────────────────────────────────────────────────────

  describe('priority', () => {
    it('!важно → 4', () => {
      expect(parseQuickAddRu('купить !важно', NOW)?.priority).toBe(4);
    });

    it('!срочно → 5', () => {
      expect(parseQuickAddRu('сдать !срочно', NOW)?.priority).toBe(5);
    });

    it('!1 → 1', () => {
      expect(parseQuickAddRu('задача !1', NOW)?.priority).toBe(1);
    });

    it('!3 → 3', () => {
      expect(parseQuickAddRu('задача !3', NOW)?.priority).toBe(3);
    });

    it('!5 → 5', () => {
      expect(parseQuickAddRu('задача !5', NOW)?.priority).toBe(5);
    });

    it('!important → 4 (EN keyword)', () => {
      expect(parseQuickAddRu('task !important', NOW)?.priority).toBe(4);
    });

    it('!urgent → 5 (EN keyword)', () => {
      expect(parseQuickAddRu('task !urgent', NOW)?.priority).toBe(5);
    });
  });

  // ── Project ────────────────────────────────────────────────────────────────

  describe('project', () => {
    it('+Дом → "Дом"', () => {
      expect(parseQuickAddRu('задача +Дом', NOW)?.project_name).toBe('Дом');
    });

    it('+Work → "Work"', () => {
      expect(parseQuickAddRu('task +Work', NOW)?.project_name).toBe('Work');
    });

    it('+"Большой проект" → "Большой проект"', () => {
      expect(parseQuickAddRu('задача +"Большой проект"', NOW)?.project_name).toBe('Большой проект');
    });
  });

  // ── Labels ─────────────────────────────────────────────────────────────────

  describe('labels', () => {
    it('*быт → ["быт"]', () => {
      expect(parseQuickAddRu('задача *быт', NOW)?.labels).toEqual(['быт']);
    });

    it('multiple labels *покупки *дом', () => {
      expect(parseQuickAddRu('задача *покупки *дом', NOW)?.labels).toEqual(['покупки', 'дом']);
    });

    it('*"очень важное" → ["очень важное"]', () => {
      expect(parseQuickAddRu('задача *"очень важное"', NOW)?.labels).toEqual(['очень важное']);
    });
  });

  // ── Recurrence ─────────────────────────────────────────────────────────────

  describe('recurrence', () => {
    it('каждый день → repeat_after=86400, mode=0', () => {
      const r = parseQuickAddRu('полив растений каждый день', NOW);
      expect(r?.repeat_after).toBe(86400);
      expect(r?.repeat_mode).toBe(0);
    });

    it('каждую неделю → repeat_after=604800, mode=0', () => {
      const r = parseQuickAddRu('уборка каждую неделю', NOW);
      expect(r?.repeat_after).toBe(604800);
      expect(r?.repeat_mode).toBe(0);
    });

    it('каждый месяц → repeat_mode=1, due_date=today-or-tomorrow', () => {
      const r = parseQuickAddRu('аренда каждый месяц', NOW);
      expect(r?.repeat_mode).toBe(1);
      expect(r?.due_date).toBeDefined();
    });

    it('каждый час → repeat_after=3600, mode=0', () => {
      const r = parseQuickAddRu('проверить логи каждый час', NOW);
      expect(r?.repeat_after).toBe(3600);
      expect(r?.repeat_mode).toBe(0);
    });

    it('каждые 2 часа → repeat_after=7200, mode=0', () => {
      const r = parseQuickAddRu('проверить каждые 2 часа', NOW);
      expect(r?.repeat_after).toBe(7200);
      expect(r?.repeat_mode).toBe(0);
    });

    it('каждые 5 часов → repeat_after=18000 (часов form)', () => {
      const r = parseQuickAddRu('бэкап каждые 5 часов', NOW);
      expect(r?.repeat_after).toBe(18000);
    });

    it('каждый вторник → weekly + due_date = next Tue', () => {
      const r = parseQuickAddRu('вынести мусор каждый вторник', NOW);
      expect(r?.repeat_after).toBe(604800);
      expect(r?.repeat_mode).toBe(0);
      expect(r?.due_date).toBe(TUE_END);
    });

    it('каждый вторник вечером → next Tue 20:00', () => {
      const r = parseQuickAddRu('вынести мусор каждый вторник вечером', NOW);
      expect(r?.due_date).toBe(d(2024, 1, 16, 20, 0));
      expect(r?.repeat_after).toBe(604800);
    });

    it('каждое 14 число → monthly + Jan 14 (future)', () => {
      const r = parseQuickAddRu('оплата каждое 14 число', NOW);
      expect(r?.repeat_mode).toBe(1);
      expect(r?.due_date).toBe(d(2024, 1, 14, 23, 59));
    });

    it('каждое 5 число → monthly + Feb 5 (5th already past in Jan)', () => {
      const r = parseQuickAddRu('каждое 5 число отчёт', NOW);
      expect(r?.repeat_mode).toBe(1);
      expect(r?.due_date).toBe(d(2024, 2, 5, 23, 59));
    });

    it('второй день каждой недели → Tue + weekly', () => {
      const r = parseQuickAddRu('задача второй день каждой недели', NOW);
      expect(r?.repeat_after).toBe(604800);
      expect(r?.due_date).toBe(TUE_END);
    });
  });

  // ── Cleaned title ──────────────────────────────────────────────────────────

  describe('cleaned_title', () => {
    it('strips date marker and capitalises first letter', () => {
      const r = parseQuickAddRu('завтра купить хлеб', NOW);
      expect(r?.cleaned_title).toBe('Купить хлеб');
    });

    it('Завтра в 16:00 купить молоко → "Купить молоко"', () => {
      const r = parseQuickAddRu('Завтра в 16:00 купить молоко', NOW);
      expect(r?.cleaned_title).toBe('Купить молоко');
    });

    it('strips priority, project, labels from title', () => {
      const r = parseQuickAddRu('задача !важно +Дом *быт', NOW);
      expect(r?.cleaned_title).toBe('Задача');
    });

    it('no cleaned_title when original text has no markers (returns null)', () => {
      expect(parseQuickAddRu('просто задача', NOW)).toBeNull();
    });

    it('does not double-capitalise already-uppercase titles', () => {
      const r = parseQuickAddRu('ЗАВТРА КУПИТЬ ЧТО-ТО', NOW);
      // The "ЗАВТРА" token is removed; remaining starts with "КУПИТЬ"
      expect(r?.cleaned_title).toBe('КУПИТЬ ЧТО-ТО');
    });

    it('collapses multiple spaces in cleaned title', () => {
      const r = parseQuickAddRu('встреча !важно завтра +Дом', NOW);
      // After removing !важно, завтра, +Дом → "встреча"
      expect(r?.cleaned_title).toBe('Встреча');
    });
  });

  // ── Integration ────────────────────────────────────────────────────────────

  describe('integration — full examples', () => {
    it('spec example: вынести мусор каждый вторник вечером !важно +Дом *быт', () => {
      const r = parseQuickAddRu(
        'вынести мусор каждый вторник вечером !важно +Дом *быт',
        NOW,
      );
      expect(r).toMatchObject({
        due_date:     d(2024, 1, 16, 20, 0),
        repeat_after: 604800,
        repeat_mode:  0,
        priority:     4,
        project_name: 'Дом',
        labels:       ['быт'],
        cleaned_title: 'Вынести мусор',
      });
    });

    it('regression: "Во вторник сходить на встречу" now parses (\\b bug fix)', () => {
      const r = parseQuickAddRu('Во вторник сходить на встречу', NOW);
      expect(r?.due_date).toBe(TUE_END);
      expect(r?.cleaned_title).toBe('Сходить на встречу');
    });

    it('regression: "Завтра купить булку хлеба" now parses (\\b bug fix)', () => {
      const r = parseQuickAddRu('Завтра купить булку хлеба', NOW);
      expect(r?.due_date).toBe(TOMORROW_END);
      expect(r?.cleaned_title).toBe('Купить булку хлеба');
    });

    it('all fields combined: через 2 дня в 10:30 !3 +Work *dev *review', () => {
      const r = parseQuickAddRu('написать PR через 2 дня в 10:30 !3 +Work *dev *review', NOW);
      expect(r).toMatchObject({
        due_date:     d(2024, 1, 12, 10, 30),
        priority:     3,
        project_name: 'Work',
        labels:       ['dev', 'review'],
        cleaned_title: 'Написать PR',
      });
    });
  });

});
