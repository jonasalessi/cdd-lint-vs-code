import type { DocumentRecord } from "./documentRecord";
import { shiftUnits, type ContentChange } from "./shiftUnits";

export type StoreListener = (uri: string) => void;

export type StoreSubscription = { dispose: () => void };

export class AnalysisStore {
  private readonly records = new Map<string, DocumentRecord>();
  private readonly listeners = new Set<StoreListener>();

  get(uri: string): DocumentRecord | undefined {
    return this.records.get(uri);
  }

  has(uri: string): boolean {
    return this.records.has(uri);
  }

  set(uri: string, record: DocumentRecord): void {
    this.records.set(uri, record);
    this.emitChange(uri);
  }

  applyContentChanges(uri: string, changes: readonly ContentChange[]): void {
    const record = this.records.get(uri);
    if (record !== undefined && changes.length > 0) {
      this.set(uri, { ...record, isStale: true, units: shiftUnits(record.units, changes) });
    }
  }

  delete(uri: string): void {
    if (this.records.delete(uri)) {
      this.emitChange(uri);
    }
  }

  clear(): void {
    [...this.records.keys()].forEach((uri) => this.delete(uri));
  }

  onDidChange(listener: StoreListener): StoreSubscription {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private emitChange(uri: string): void {
    this.listeners.forEach((listener) => listener(uri));
  }
}
