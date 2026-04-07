import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { useSystemTrash } from './logVaultOps';

function buildMockApp(trashOption?: string): App {
    return {
        vault: {
            getConfig: (key: string) => {
                if (key === 'trashOption') return trashOption;
                return undefined;
            },
        },
    } as unknown as App;
}

describe('useSystemTrash', () => {
    it('returns true when user has trashOption set to system', () => {
        expect(useSystemTrash(buildMockApp('system'))).toBe(true);
    });

    it('returns false when user has trashOption set to local', () => {
        expect(useSystemTrash(buildMockApp('local'))).toBe(false);
    });

    it('returns false when user has trashOption set to none', () => {
        expect(useSystemTrash(buildMockApp('none'))).toBe(false);
    });

    it('returns false when trashOption is undefined', () => {
        expect(useSystemTrash(buildMockApp(undefined))).toBe(false);
    });

    it('returns false when getConfig is not available', () => {
        const app = { vault: {} } as unknown as App;
        expect(useSystemTrash(app)).toBe(false);
    });

    it('returns false when vault.getConfig throws', () => {
        const app = {
            vault: {
                getConfig: () => { throw new Error('broken'); },
            },
        } as unknown as App;
        expect(useSystemTrash(app)).toBe(false);
    });
});
