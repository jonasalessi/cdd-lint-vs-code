// Shows a notification one time for each key, until the key is reset.
export class NotifyOnce {
  private readonly shownKeys = new Set<string>();

  show(key: string, showNotification: () => void): void {
    if (this.shownKeys.has(key)) {
      return;
    }
    this.shownKeys.add(key);
    showNotification();
  }

  reset(key: string): void {
    this.shownKeys.delete(key);
  }
}
