/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * i18n - Internationalization for Radial Timeline
 * 
 * Design principles:
 * - English is always complete (the source of truth)
 * - Other languages fall back to English for missing keys
 * - New features only need English strings added
 * - Translators can incrementally add translations
 * 
 * Usage:
 *   import { t } from '../i18n';
 *   .setName(t('settings.general.sourcePath.name'))
 */

import { moment } from 'obsidian';
import { en, type TranslationKeys } from './locales/en';
import { ja } from './locales/ja';
// Future: import { ar } from './locales/ar';
// Future: import { de } from './locales/de';

// Helper type for deep partial (allows partial translations at any nesting level)
type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// All available locales - add new languages here
const locales: Record<string, DeepPartial<TranslationKeys>> = {
    en,
    ja,
    // ar,
    // de,
};

// Cache the current locale to avoid repeated lookups
let cachedLocale: string | null = null;
let cachedTranslations: TranslationKeys | null = null;

/**
 * Get the current Obsidian locale code
 */
function getCurrentLocale(): string {
    // Obsidian uses moment.js for localization
    const locale = moment.locale();
    // Handle locale variants (e.g., 'zh-cn' -> 'zh')
    const baseLocale = locale.split('-')[0];
    return baseLocale;
}

/**
 * Deep merge translations, with source overriding target for defined values.
 * Uses loose typing since we know the structures are compatible at runtime.
 */
function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
): Record<string, unknown> {
    const result = { ...target };
    
    for (const key of Object.keys(source)) {
        const sourceVal = source[key];
        const targetVal = target[key];
        
        if (sourceVal !== undefined) {
            if (
                typeof sourceVal === 'object' && 
                sourceVal !== null && 
                !Array.isArray(sourceVal) &&
                typeof targetVal === 'object' && 
                targetVal !== null
            ) {
                // Recursively merge objects
                result[key] = deepMerge(
                    targetVal as Record<string, unknown>,
                    sourceVal as Record<string, unknown>
                );
            } else {
                // Use the source value directly
                result[key] = sourceVal;
            }
        }
    }
    
    return result;
}

/**
 * Get merged translations for current locale (with English fallback)
 */
function getTranslations(): TranslationKeys {
    const locale = getCurrentLocale();
    
    // Return cached if locale hasn't changed
    if (cachedLocale === locale && cachedTranslations) {
        return cachedTranslations;
    }
    
    cachedLocale = locale;
    
    // Start with English (complete), overlay locale-specific translations
    if (locale === 'en' || !locales[locale]) {
        cachedTranslations = en;
    } else {
        // Merge: English base + locale overrides
        // Cast through unknown is safe because English provides all keys, locale just overrides some
        cachedTranslations = deepMerge(
            en as unknown as Record<string, unknown>,
            locales[locale] as unknown as Record<string, unknown>
        ) as unknown as TranslationKeys;
    }
    
    return cachedTranslations;
}

/**
 * Get a translated string by dot-notation key
 * 
 * @param key - Dot-notation path like 'settings.general.sourcePath.name'
 * @param vars - Optional variable substitutions: { count: '5' } replaces {{count}}
 * @returns The translated string, or the key itself if not found
 * 
 * @example
 * t('settings.general.heading') // "General"
 * t('settings.configuration.resetSubplotColors.clearedNotice', { count: '5' }) // "Cleared saved colors for 5 scenes."
 */
export function t(key: string, vars?: Record<string, string | number>): string {
    const translations = getTranslations();
    
    // Navigate the nested object by key path
    const keys = key.split('.');
    let value: unknown = translations;
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = (value as Record<string, unknown>)[k];
        } else {
            // Key not found - return the key itself for debugging
            console.warn(`[i18n] Missing translation key: ${key}`);
            return key;
        }
    }
    
    if (typeof value !== 'string') {
        console.warn(`[i18n] Translation key "${key}" is not a string`);
        return key;
    }
    
    // Variable substitution: {{name}} -> value
    if (vars) {
        let result = value;
        for (const [varKey, varValue] of Object.entries(vars)) {
            result = result.replace(new RegExp(`\\{\\{${varKey}\\}\\}`, 'g'), String(varValue));
        }
        return result;
    }
    
    return value;
}

/**
 * Clear the locale cache (call when locale might have changed)
 */
export function clearLocaleCache(): void {
    cachedLocale = null;
    cachedTranslations = null;
}

/**
 * Get the current locale code (useful for debugging)
 */
export function getLocale(): string {
    return getCurrentLocale();
}
