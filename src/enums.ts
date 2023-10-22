export enum EventHandlerStatus {
  QUEUED = "QUEUED",
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
}

export enum ProviderStatus {
  STARTING = "STARTING",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  DEAD = "DEAD",
}

export enum WorkerStatus {
  WAITING = "WAITING",
  STARTED = "STARTED",
  CRASHED = "CRASHED",
  DEAD = "DEAD",
}
