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

    if (!variables.hasBody) {
        pushIssue(
            issues,
            'error',
            'rtts_missing_body',
            'Template is missing $body$; Pandoc has nowhere to place the manuscript.'
        );
    }

    if (variables.hasBody && !variables.hasTitle) {
        pushIssue(
            issues,
            'warning',
            'rtts_missing_title',
            'Template does not expose $title$; the book title may not appear in template-controlled areas.'
        );
    }

    if (variables.hasBody && !variables.hasAuthor) {
        pushIssue(
            issues,
            'warning',
            'rtts_missing_author',
            'Template does not expose $author$. The PDF may omit the author from title pages or headers.'
        );
    }

    for (const capability of declaredCapabilities) {
        const requiredHooks = CAPABILITY_HOOKS[capability] || [];
        if (requiredHooks.length === 0) continue;
        const missingHooks = requiredHooks.filter(hook => !variables.hooks[hook]);
        if (missingHooks.length > 0) {
            pushIssue(
                issues,
                'warning',
                'rtts_capability_missing_hook',
                `Declared RTTS capability "${capability}" is not backed by the template content.`,
                `Missing hook(s): ${missingHooks.join(', ')}`
            );
        }
    }

    const hasAnyHook = Object.values(variables.hooks).some(Boolean);
    if (variables.hasBody && !hasAnyHook) {
        pushIssue(
            issues,
            'info',
            'rtts_legacy_body_fallback',
            'Legacy template mode. All manuscript content will be sent through $body$.'
        );
    } else {
        for (const hook of RTTS_STRUCTURED_HOOKS) {
            if (!variables.hooks[hook]) {
                pushIssue(
                    issues,
                    'info',
                    'rtts_optional_hook_absent',
                    `Optional RTTS hook "$${hook}$" is not present.`,
                    'Structured matter hooks are optional in this version.'
                );
            }
        }
    }

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
