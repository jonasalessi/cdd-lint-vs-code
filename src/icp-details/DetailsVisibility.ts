export type VisibilityListener = (uri: string) => void;

export type VisibilitySubscription = { dispose: () => void };

// Holds the documents whose ICP details the user switched on. The details are off by default.
export class DetailsVisibility {
  private readonly shownUris = new Set<string>();
  private readonly listeners = new Set<VisibilityListener>();

  isShown(uri: string): boolean {
    return this.shownUris.has(uri);
  }

  toggle(uri: string): void {
    if (!this.shownUris.delete(uri)) {
      this.shownUris.add(uri);
    }
    this.listeners.forEach((listener) => listener(uri));
  }

  onDidChange(listener: VisibilityListener): VisibilitySubscription {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
}
