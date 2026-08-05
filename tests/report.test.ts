import { describe, expect, it } from 'vitest';
import { daily, dailyStats, filtered } from '../src/report';
import type { HealthRecord } from '../src/shared/types';
const rows: HealthRecord[] = [{ metric: 'weight', date: '2026-01-01T09:00:00.000Z', value: 70, unit: 'kg' }, { metric: 'weight', date: '2026-01-01T12:00:00.000Z', value: 72, unit: 'kg' }, { metric: 'steps', date: '2026-01-02T12:00:00.000Z', value: 1000, unit: 'count' }];
describe('report model', () => { it('filters an inclusive date range', () => expect(filtered(rows, '2026-01-01', '2026-01-01')).toHaveLength(2)); it('averages measurements per day for a trend', () => expect(daily(rows, 'weight')).toEqual([{ date: '2026-01-01', value: 71, unit: 'kg' }])); it('creates a compact daily statistical summary', () => expect(dailyStats(rows, 'weight')[0]).toMatchObject({ date: '2026-01-01', min: 70, max: 72, average: 71, standardDeviation: 1, values: [70, 72] })); });
