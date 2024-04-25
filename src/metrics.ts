class MetricsClass {
  readonly connectionLostCounterPerNetId: Record<number, number> = {};
  readonly connectionFailedCounterPerNetId: Record<number, number> = {};
  readonly connectionStateGaugePerNetId: Record<number, number> = {};
  readonly workerStateGaugePerNetId: Record<number, number> = {};
  readonly requestCounterPerNetId: Record<number, number> = {};
  readonly requestResponseCounterPerNetId: Record<number, number> = {};
  readonly requestErrorCounterPerNetId: Record<number, number> = {};
  readonly eventCounterPerNetId: Record<number, number> = {};
  readonly subscriptionGaugePerNetId: Record<number, number> = {};
  readonly gqlSubscriptionGaugePerNetId: Record<number, number> = {};

  constructor() {
    this.gqlSubscriptionGaugePerNetId[0] = 0;
  }

  reset() {
    this.clearRecord(this.connectionLostCounterPerNetId);
    this.clearRecord(this.connectionFailedCounterPerNetId);
    this.clearRecord(this.connectionStateGaugePerNetId);
    this.clearRecord(this.workerStateGaugePerNetId);
    this.clearRecord(this.requestCounterPerNetId);
    this.clearRecord(this.requestResponseCounterPerNetId);
    this.clearRecord(this.requestErrorCounterPerNetId);
    this.clearRecord(this.eventCounterPerNetId);
    this.clearRecord(this.subscriptionGaugePerNetId);
    this.clearRecord(this.gqlSubscriptionGaugePerNetId);
    this.gqlSubscriptionGaugePerNetId[0] = 0;
  }

  private clearRecord(rec: Record<any, any>) {
    Object.keys(rec).forEach((key) => delete rec[key]);
  }

  chainInit(chainId: number) {
    if (this.connectionStateGaugePerNetId[chainId] === undefined) {
      this.connectionStateGaugePerNetId[chainId] = 0;
    }
    if (this.connectionLostCounterPerNetId[chainId] === undefined) {
      this.connectionLostCounterPerNetId[chainId] = 0;
    }
    if (this.connectionFailedCounterPerNetId[chainId] === undefined) {
      this.connectionFailedCounterPerNetId[chainId] = 0;
    }
    if (this.workerStateGaugePerNetId[chainId] === undefined) {
      this.workerStateGaugePerNetId[chainId] = 0;
    }
    if (this.requestCounterPerNetId[chainId] === undefined) {
      this.requestCounterPerNetId[chainId] = 0;
    }
    if (this.requestResponseCounterPerNetId[chainId] === undefined) {
      this.requestResponseCounterPerNetId[chainId] = 0;
    }
    if (this.requestErrorCounterPerNetId[chainId] === undefined) {
      this.requestErrorCounterPerNetId[chainId] = 0;
    }
    if (this.eventCounterPerNetId[chainId] === undefined) {
      this.eventCounterPerNetId[chainId] = 0;
    }
    this.subscriptionGaugePerNetId[chainId] = 0;
    this.gqlSubscriptionGaugePerNetId[chainId] = 0;
  }

  connected(chainId: number) {
    this.connectionStateGaugePerNetId[chainId] = 1;
  }

  connectionFailed(chainId: number) {
    this.connectionStateGaugePerNetId[chainId] = 0;
    this.connectionFailedCounterPerNetId[chainId]++;
  }

  disconnected(chainId: number) {
    if (this.connectionLostCounterPerNetId[chainId] === undefined) {
      this.connectionLostCounterPerNetId[chainId] = 0;
    }
    this.connectionLostCounterPerNetId[chainId]++;
    this.connectionStateGaugePerNetId[chainId] = 0;
  }

  workerStarted(chainId: number) {
    this.workerStateGaugePerNetId[chainId] = 1;
  }

  workerStopped(chainId: number) {
    this.workerStateGaugePerNetId[chainId] = 0;
  }

  requestSent(chainId: number) {
    if (this.requestCounterPerNetId[chainId] === undefined) {
      this.requestCounterPerNetId[chainId] = 0;
    }
    this.requestCounterPerNetId[chainId]++;
  }

  requestReplied(chainId: number) {
    if (this.requestResponseCounterPerNetId[chainId] === undefined) {
      this.requestResponseCounterPerNetId[chainId] = 0;
    }
    this.requestResponseCounterPerNetId[chainId]++;
  }

  requestFailed(chainId: number) {
    if (this.requestErrorCounterPerNetId[chainId] === undefined) {
      this.requestErrorCounterPerNetId[chainId] = 0;
    }
    this.requestErrorCounterPerNetId[chainId]++;
  }

  eventReceived(chainId: number) {
    if (this.eventCounterPerNetId[chainId] === undefined) {
      this.eventCounterPerNetId[chainId] = 0;
    }
    this.eventCounterPerNetId[chainId]++;
  }

  setSubscriptionCount(chainId: number, count: number) {
    this.subscriptionGaugePerNetId[chainId] = count;
  }

  setGqlSubscriptionCount(chainId: number, count: number) {
    this.gqlSubscriptionGaugePerNetId[chainId] = count;
  }

  dumpMetrics(): string {
    let result = "";
    result += this.formatGauge("connectionState", this.connectionStateGaugePerNetId);
    result += this.formatCounter("connectionLoss", this.connectionLostCounterPerNetId);
    result += this.formatCounter("connectionFailed", this.connectionFailedCounterPerNetId);
    result += this.formatGauge("workerState", this.workerStateGaugePerNetId);
    result += this.formatCounter("requestSent", this.requestCounterPerNetId);
    result += this.formatCounter("requestReplied", this.requestResponseCounterPerNetId);
    result += this.formatCounter("requestFailed", this.requestErrorCounterPerNetId);
    result += this.formatCounter("eventsReceived", this.eventCounterPerNetId);
    result += this.formatGauge("subscriptions", this.subscriptionGaugePerNetId);
    result += this.formatGauge("gqlSubscriptions", this.gqlSubscriptionGaugePerNetId);
    return result;
  }

  formatGauge(name: string, data: Record<number, number>): string {
    return this.format(name, data, "gauge");
  }

  formatCounter(name: string, data: Record<number, number>): string {
    return this.format(name, data, "counter");
  }

  format(name: string, data: Record<number, number>, kind: "gauge" | "counter"): string {
    if (Object.entries(data).length === 0) return "";

    let result = `# TYPE ${name} ${kind}\n`;
    for (const [chainId, value] of Object.entries(data)) {
      result += `${name} {chainId="${chainId}"} ${value}\n`;
    }

    return result;
  }
}

export const Metrics = new MetricsClass();
