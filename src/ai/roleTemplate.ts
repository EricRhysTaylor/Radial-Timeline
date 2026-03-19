import type RadialTimelinePlugin from '../main';
import type { AiSettingsV1 } from './types';

export type ActiveRoleTemplate = {
    id: string;
    name: string;
    prompt: string;
};

export function resolveActiveRoleTemplate(
    plugin: RadialTimelinePlugin,
    aiSettings: AiSettingsV1
): ActiveRoleTemplate {
    const templates = plugin.settings.aiContextTemplates || [];
    const preferredId = (aiSettings.roleTemplateId || plugin.settings.activeAiContextTemplateId || '').trim();
    const selected = templates.find(entry => entry.id === preferredId) || templates[0];
    if (selected) {
        return {
            id: selected.id,
            name: selected.name || selected.id || 'Role Template',
            prompt: selected.prompt || 'You are an editorial analysis assistant.'
        };
    }
    return {
        id: 'default',
        name: 'Default Role Template',
        prompt: 'You are an editorial analysis assistant.'
    };
}
