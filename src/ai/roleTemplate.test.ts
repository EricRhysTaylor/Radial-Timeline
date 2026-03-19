import { describe, expect, it } from 'vitest';
import { resolveActiveRoleTemplate } from './roleTemplate';

describe('resolveActiveRoleTemplate', () => {
    it('prefers aiSettings.roleTemplateId over legacy activeAiContextTemplateId', () => {
        const plugin = {
            settings: {
                activeAiContextTemplateId: 'legacy',
                aiContextTemplates: [
                    { id: 'legacy', name: 'Legacy', prompt: 'Legacy prompt' },
                    { id: 'canonical', name: 'Canonical', prompt: 'Canonical prompt' }
                ]
            }
        } as any;

        const result = resolveActiveRoleTemplate(plugin, { roleTemplateId: 'canonical' } as any);

        expect(result.name).toBe('Canonical');
        expect(result.prompt).toBe('Canonical prompt');
    });
});
