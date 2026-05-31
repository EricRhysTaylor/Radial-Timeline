import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlanetaryProfile } from '../src/types/settings';
import { convertFromEarth, convertToEarth } from '../src/utils/planetaryTime';

const TEST_PROFILE: PlanetaryProfile = {
    id: 'test',
    label: 'Test',
    hoursPerDay: 25,
    daysPerWeek: 5,
    daysPerYear: 13,
    epochLabel: 'SOL',
    monthNames: ['Aster', 'Beryl', 'Cinder'],
    weekdayNames: ['One', 'Two', 'Three', 'Four', 'Five'],
};

describe('planetary time conversion', () => {
    it('converts Earth time to planetary time and back using the same profile', () => {
        const earthDate = new Date(12 * 25 * 60 * 60 * 1000);
        const fromEarth = convertFromEarth(earthDate, TEST_PROFILE);

        expect(fromEarth?.localYear).toBe(1);
        expect(fromEarth?.localMonthIndex).toBe(2);
        expect(fromEarth?.localDayOfMonth).toBe(5);
        expect(fromEarth?.formatted).toContain('SOL Year 1');

        const toEarth = convertToEarth({
            localYear: 1,
            localMonthIndex: 2,
            localDayOfMonth: 5,
            localHours: 0,
            localMinutes: 0,
        }, TEST_PROFILE);

        expect(toEarth?.earthDate.getTime()).toBe(earthDate.getTime());
        expect(toEarth?.formatted).toBe(fromEarth?.formatted);
    });

    it('accepts local hours above 23 when the planetary day is longer than Earth', () => {
        const valid = convertToEarth({
            localYear: 1,
            localMonthIndex: 0,
            localDayOfMonth: 1,
            localHours: 24,
            localMinutes: 30,
        }, TEST_PROFILE);
        const invalid = convertToEarth({
            localYear: 1,
            localMonthIndex: 0,
            localDayOfMonth: 1,
            localHours: 25,
            localMinutes: 0,
        }, TEST_PROFILE);

        expect(valid?.earthDate.getTime()).toBe((24.5 * 60 * 60 * 1000));
        expect(invalid).toBeNull();
    });

    it('keeps the converter modal bidirectional and labels Chronologue by active profile', () => {
        const modalSource = readFileSync(resolve(process.cwd(), 'src/modals/PlanetaryTimeModal.ts'), 'utf8');
        const chronoSource = readFileSync(resolve(process.cwd(), 'src/settings/sections/ChronologueSection.ts'), 'utf8');
        const defaultsSource = readFileSync(resolve(process.cwd(), 'src/settings/defaults.ts'), 'utf8');
        const settingsTypeSource = readFileSync(resolve(process.cwd(), 'src/types/settings.ts'), 'utf8');

        expect(settingsTypeSource).toContain("export type PlanetaryTimeConversionDirection = 'earth-to-planet' | 'planet-to-earth'");
        expect(modalSource).toContain('convertToEarth');
        expect(modalSource).toContain('renderPlanetToEarthResult');
        expect(modalSource).toContain('addPlanetarySelectField');
        expect(modalSource).toContain('ert-planetary-field-row');
        expect(modalSource).toContain('planetaryTimeLastDirection');
        expect(defaultsSource).toContain("planetaryTimeLastDirection: 'earth-to-planet'");
        expect(chronoSource).toContain('getActivePlanetaryProfile');
        expect(chronoSource).toContain(".addOption('planetary', activePlanetaryLabel)");
    });
});
