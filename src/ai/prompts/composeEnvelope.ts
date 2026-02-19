export interface EnvelopeInput {
    roleTemplateName: string;
    roleTemplateText: string;
    projectContext: string;
    featureModeInstructions: string;
    userInput: string;
    userQuestion?: string;
    outputRules: string;
    placeUserQuestionLast?: boolean;
}

export interface ComposedEnvelope {
    systemPrompt: string;
    userPrompt: string;
    finalPrompt: string;
}

function section(title: string, body: string): string {
    const trimmed = body.trim();
    if (!trimmed) return `${title}:\n(none)`;
    return `${title}:\n${trimmed}`;
}

export function composeEnvelope(input: EnvelopeInput): ComposedEnvelope {
    const parts: string[] = [];
    parts.push(section('Project Context', input.projectContext));
    parts.push(section('Feature Mode Instructions', input.featureModeInstructions));

    const includeQuestion = typeof input.userQuestion === 'string' && input.userQuestion.trim().length > 0;
    const userInputBody = includeQuestion
        ? input.userInput
        : (input.userInput || input.userQuestion || '');
    parts.push(section('User Input', userInputBody));

    if (input.placeUserQuestionLast && includeQuestion) {
        parts.push(section('Output Schema / Formatting Rules', input.outputRules));
        parts.push(section('User Question (highest priority)', input.userQuestion || ''));
    } else {
        if (includeQuestion) {
            parts.push(section('User Question (highest priority)', input.userQuestion || ''));
        }
        parts.push(section('Output Schema / Formatting Rules', input.outputRules));
    }

    const systemPrompt = section(
        'System Role Template',
        `Template: ${input.roleTemplateName}\n${input.roleTemplateText}`
    );
    const userPrompt = parts.join('\n\n');
    return {
        systemPrompt,
        userPrompt,
        finalPrompt: `${systemPrompt}\n\n${userPrompt}`
    };
}
