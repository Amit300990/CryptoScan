import { EventEmitter } from "events";

export type ScanProgressEvent = {
  type: "asset_discovered" | "finding_generated" | "scan_completed" | "scan_failed";
  jobId: number;
  environmentId: number;
  assetsDiscovered: number;
  totalAssets: number;
  findingsGenerated: number;
  assetName?: string;
  errorMessage?: string;
};

class ScanEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
  }

  emitProgress(event: ScanProgressEvent) {
    this.emit(`env:${event.environmentId}`, event);
    this.emit("all", event);
  }

  onEnvironment(environmentId: number, listener: (event: ScanProgressEvent) => void) {
    this.on(`env:${environmentId}`, listener);
  }

  offEnvironment(environmentId: number, listener: (event: ScanProgressEvent) => void) {
    this.off(`env:${environmentId}`, listener);
  }
}

export const scanEventBus = new ScanEventBus();
