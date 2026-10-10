import type { AnalysisResult } from "./analyzeDocument";
import type { DocumentRecord } from "./documentRecord";

export type DocumentState = {
  isOpen: boolean;
  isSupported: boolean;
  isClean: boolean;
  version: number;
};

export type RequestResult = "scheduled" | "unsupported" | "dirty";

export type TimerHandle = ReturnType<typeof setTimeout>;

export type PipelineFunction = (uri: string, signal: AbortSignal) => Promise<AnalysisResult>;

export type RequestQueueDependencies = {
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer: (timer: TimerHandle) => void;
  runPipeline: PipelineFunction;
  getDocumentState: (uri: string) => DocumentState;
  applyRecord: (uri: string, record: DocumentRecord) => void;
};

export type ActivityListener = (uri: string) => void;

export type ActivitySubscription = { dispose: () => void };

type ActivePipeline = { abortController: AbortController; version: number };

export const requestDelayMs = 50;

export class RequestQueue {
  private readonly pendingRequests = new Map<string, TimerHandle>();
  private readonly activePipelines = new Map<string, ActivePipeline>();
  private readonly listeners = new Set<ActivityListener>();

  constructor(private readonly dependencies: RequestQueueDependencies) {}

  request(uri: string): RequestResult {
    const state = this.dependencies.getDocumentState(uri);
    if (!state.isOpen || !state.isSupported) {
      return "unsupported";
    }
    if (!state.isClean) {
      return "dirty";
    }
    this.replacePendingRequest(uri);
    return "scheduled";
  }

  cancel(uri: string): void {
    this.cancelPendingRequest(uri);
    this.abortActivePipeline(uri);
  }

  cancelAll(): void {
    const uris = [...this.pendingRequests.keys(), ...this.activePipelines.keys()];
    uris.forEach((uri) => this.cancel(uri));
  }

  isActive(uri: string): boolean {
    return this.activePipelines.has(uri);
  }

  // The listener receives the URI when a pipeline of that document starts or ends.
  onDidChangeActivity(listener: ActivityListener): ActivitySubscription {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  dispose(): void {
    this.cancelAll();
    this.listeners.clear();
  }

  private replacePendingRequest(uri: string): void {
    this.cancelPendingRequest(uri);
    const timer = this.dependencies.setTimer(() => this.startPipeline(uri), requestDelayMs);
    this.pendingRequests.set(uri, timer);
  }

  private cancelPendingRequest(uri: string): void {
    const timer = this.pendingRequests.get(uri);
    if (timer !== undefined) {
      this.dependencies.clearTimer(timer);
      this.pendingRequests.delete(uri);
    }
  }

  private abortActivePipeline(uri: string): void {
    const pipeline = this.activePipelines.get(uri);
    if (pipeline !== undefined) {
      pipeline.abortController.abort();
      this.activePipelines.delete(uri);
      this.emitActivity(uri);
    }
  }

  private startPipeline(uri: string): void {
    this.pendingRequests.delete(uri);
    const state = this.dependencies.getDocumentState(uri);
    if (state.isOpen && state.isSupported && state.isClean) {
      this.abortActivePipeline(uri);
      void this.runPipeline(uri, {
        abortController: new AbortController(),
        version: state.version,
      });
    }
  }

  private async runPipeline(uri: string, pipeline: ActivePipeline): Promise<void> {
    this.activePipelines.set(uri, pipeline);
    this.emitActivity(uri);
    const result = await this.dependencies.runPipeline(uri, pipeline.abortController.signal);
    if (pipeline.abortController.signal.aborted) {
      return;
    }
    this.activePipelines.delete(uri);
    this.applyResult(uri, result, pipeline.version);
    this.emitActivity(uri);
  }

  private applyResult(uri: string, result: AnalysisResult, startVersion: number): void {
    const state = this.dependencies.getDocumentState(uri);
    const isCurrent = state.isOpen && state.version === startVersion;
    if (result.kind === "record" && isCurrent) {
      this.dependencies.applyRecord(uri, result.record);
    }
  }

  private emitActivity(uri: string): void {
    this.listeners.forEach((listener) => listener(uri));
  }
}
