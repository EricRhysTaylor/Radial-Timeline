import type { EventRef } from 'obsidian';

export {};

declare module 'obsidian' {
  interface Component {
    registerInterval(handle: number): number;
    registerDomEvent(
      el: HTMLElement | Window | Document,
      event: string,
      callback: (...args: any[]) => any, // SAFE: any used to match Obsidian's official API signature for DOM event handlers
      options?: boolean | AddEventListenerOptions
    ): EventRef;
  }
}
