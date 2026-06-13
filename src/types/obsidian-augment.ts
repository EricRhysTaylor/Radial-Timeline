import type { EventRef } from 'obsidian';

export {};

declare module 'obsidian' {
  interface Component {
    registerInterval(handle: number): number;
    registerDomEvent(
      el: HTMLElement | Window | Document,
      event: string,
      // Method syntax keeps parameters bivariant, so handlers typed with
      // specific Event subclasses (KeyboardEvent, CustomEvent, ...) still fit.
      callback: (evt: Event) => void,
      options?: boolean | AddEventListenerOptions
    ): EventRef;
  }
}
