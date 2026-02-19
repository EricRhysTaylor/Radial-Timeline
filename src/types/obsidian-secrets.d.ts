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

        /**
         * Store/update a secret by identifier.
         * Method name varies across Obsidian builds.
         */
        set?(key: string, value: string): Promise<void> | void;
        store?(key: string, value: string): Promise<void> | void;

        /**
         * Delete/remove a secret by identifier.
         * Method name varies across Obsidian builds.
         */
        delete?(key: string): Promise<void> | void;
        remove?(key: string): Promise<void> | void;
    }

    class SecretComponent extends TextComponent {
        constructor(containerEl: HTMLElement);
    }
}
