export interface QueueStats {
  pending: number;
  sent: number;
  dropped: number;
  lastUploadAt: string | null;
  lastCaptureAt: string | null;
  /** "offline" | "unavailable" | "unauthorized" | "rejected" | "http_NNN" | "error" */
  lastError: string | null;
  hasToken: boolean;
  whitelistSize: number;
}

export interface CapturedSample {
  packageName: string;
  postedAt: string;
  title: string | null;
  text: string | null;
  bigText: string | null;
  subText: string | null;
}

export interface NotificationCaptureNative {
  isEnabled(): boolean;
  openSettings(): void;
  openAppDetails(): void;
  setWhitelist(packages: string[]): void;
  setAuthToken(token: string, apiUrl: string): void;
  clearAuthToken(): void;
  getQueueStats(): QueueStats;
  flush(): void;
  setCaptureMode(on: boolean): void;
  getCaptureMode(): boolean;
  getCapturedSamples(): CapturedSample[];
  clearCapturedSamples(): void;
}
