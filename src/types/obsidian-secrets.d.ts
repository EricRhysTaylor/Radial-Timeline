import 'obsidian';

declare module 'obsidian' {
    interface App {
        secretStorage?: SecretStorage;
    }

    interface SecretStorage {
        /**
         * Get the value of a secret by its identifier.
         * @param key The identifier of the secret.
         */
        get(key: string): Promise<string | null>;
        
        /**
         * Check if a secret exists.
         * @param key The identifier of the secret.
         */
        has(key: string): Promise<boolean>;
    }

    class SecretComponent extends TextComponent {
        constructor(containerEl: HTMLElement);
    }
}
