import type { ValidationIssue } from '../types';

export type RttsValidationLevel = 'invalid' | 'legacy' | 'compatible';

export interface RttsValidationResult {
    level: RttsValidationLevel;
    issues: ValidationIssue[];
    variables: {
        hasBody: boolean;
        hasTitle: boolean;
        hasAuthor: boolean;
        hooks: Record<string, boolean>;
    };
    declaredCapabilities: string[];
    detectedCapabilities: string[];
}

export interface RttsValidationOptions {
    declaredCapabilities?: string[];
    readError?: string;
}

export const RTTS_STRUCTURED_HOOKS = [
    'frontmatter_title',
    'frontmatter_dedication',
    'frontmatter_acknowledgments',
    'backmatter_author_note',
] as const;

const CAPABILITY_HOOKS: Record<string, string[]> = {
    semanticMatter: [...RTTS_STRUCTURED_HOOKS],
    frontmatter_title: ['frontmatter_title'],
    frontmatter_dedication: ['frontmatter_dedication'],
    frontmatter_acknowledgments: ['frontmatter_acknowledgments'],
    backmatter_author_note: ['backmatter_author_note'],
};

function hasPandocVariable(content: string, variable: string): boolean {
    const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\$${escaped}\\$|\\$if\\(${escaped}\\)\\$`, 'i').test(content);
}

function pushIssue(
    target: ValidationIssue[],
    level: ValidationIssue['level'],
    code: string,
    message: string,
    detail?: string
): void {
    target.push({
        scope: 'asset',
        level,
        code,
        message,
        ...(detail ? { detail } : {}),
    });
}

function normalizeDeclaredCapabilities(capabilities: string[] | undefined): string[] {
    return Array.from(new Set(
        (capabilities || [])
            .map(capability => capability.trim())
            .filter(Boolean)
    ));
}

function getRequiredHooksForCapabilities(capabilities: string[]): string[] {
    const hooks = new Set<string>();
    for (const capability of capabilities) {
        for (const hook of CAPABILITY_HOOKS[capability] || []) {
            hooks.add(hook);
        }
    }
    return Array.from(hooks);
}

export function validateRttsTemplateContent(
    content: string,
    options: RttsValidationOptions = {}
): RttsValidationResult {
    const declaredCapabilities = normalizeDeclaredCapabilities(options.declaredCapabilities);
    const issues: ValidationIssue[] = [];
    const source = content || '';

    if (options.readError) {
        pushIssue(issues, 'error', 'rtts_template_unreadable', options.readError);
    }

    const hooks: Record<string, boolean> = {};
    for (const hook of RTTS_STRUCTURED_HOOKS) {
        hooks[hook] = hasPandocVariable(source, hook);
    }

    const variables = {
        hasBody: hasPandocVariable(source, 'body'),
        hasTitle: hasPandocVariable(source, 'title'),
        hasAuthor: hasPandocVariable(source, 'author'),
        hooks,
    };

    // Only template-side issues that BLOCK export are reported here.
    // Anything in the form "the template doesn't have X" is left out — that
    // describes template capability, not an actionable problem for the user.
    // Book-meta gaps the template *needs* are surfaced by
    // PublishingValidationService (the book-details and matter checklists).
    if (!variables.hasBody) {
        pushIssue(
            issues,
            'error',
            'rtts_missing_body',
            'Template is missing $body$; Pandoc has nowhere to place the manuscript.'
        );
    }

    const hasAnyHook = Object.values(variables.hooks).some(Boolean);

    const requiredHooks = getRequiredHooksForCapabilities(declaredCapabilities);
    const declaredHooksPresent = requiredHooks.every(hook => variables.hooks[hook]);
    const level: RttsValidationLevel = !variables.hasBody || !!options.readError
        ? 'invalid'
        : variables.hasTitle && variables.hasAuthor && declaredHooksPresent && hasAnyHook
            ? 'compatible'
            : 'legacy';

    const detectedCapabilities: string[] = RTTS_STRUCTURED_HOOKS.filter(hook => variables.hooks[hook]);
    if (detectedCapabilities.length > 0) {
        detectedCapabilities.push('structuredBlocks');
    }

    return {
        level,
        issues,
        variables,
        declaredCapabilities,
        detectedCapabilities,
    };
}
