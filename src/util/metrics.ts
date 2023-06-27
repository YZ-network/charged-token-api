export class Metrics {
  static readonly connectionLostCounterPerNetId: Record<number, number> = {};
  static readonly connectionFailedCounterPerNetId: Record<number, number> = {};
  static readonly connectionStateGaugePerNetId: Record<number, number> = {};
  static readonly workerStateGaugePerNetId: Record<number, number> = {};
  static readonly requestCounterPerNetId: Record<number, number> = {};
  static readonly requestResponseCounterPerNetId: Record<number, number> = {};
  static readonly requestErrorCounterPerNetId: Record<number, number> = {};
  static readonly eventCounterPerNetId: Record<number, number> = {};
  static readonly subscriptionGaugePerNetId: Record<number, number> = {};

  static chainInit(chainId: number) {
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
  }

  static connected(chainId: number) {
    this.chainInit(chainId);
    this.connectionStateGaugePerNetId[chainId] = 1;
  }

  static connectionFailed(chainId: number) {
    this.chainInit(chainId);
    this.connectionFailedCounterPerNetId[chainId]++;
  }

  static disconnected(chainId: number) {
    if (this.connectionLostCounterPerNetId[chainId] === undefined) {
      this.connectionLostCounterPerNetId[chainId] = 0;
    }
    this.connectionLostCounterPerNetId[chainId]++;
    this.connectionStateGaugePerNetId[chainId] = 0;
  }

  static workerStarted(chainId: number) {
    this.chainInit(chainId);
    this.workerStateGaugePerNetId[chainId] = 1;
  }

  static workerStopped(chainId: number) {
    this.chainInit(chainId);
    this.workerStateGaugePerNetId[chainId] = 0;
  }

  static requestSent(chainId: number) {
    if (this.requestCounterPerNetId[chainId] === undefined) {
      this.requestCounterPerNetId[chainId] = 0;
    }
    this.requestCounterPerNetId[chainId]++;
  }

  static requestReplied(chainId: number) {
    if (this.requestResponseCounterPerNetId[chainId] === undefined) {
      this.requestResponseCounterPerNetId[chainId] = 0;
    }
    this.requestResponseCounterPerNetId[chainId]++;
  }

  static requestFailed(chainId: number) {
    if (this.requestErrorCounterPerNetId[chainId] === undefined) {
      this.requestErrorCounterPerNetId[chainId] = 0;
    }
    this.requestErrorCounterPerNetId[chainId]++;
  }

  static eventReceived(chainId: number) {
    if (this.eventCounterPerNetId[chainId] === undefined) {
      this.eventCounterPerNetId[chainId] = 0;
    }
    this.eventCounterPerNetId[chainId]++;
  }

  static setSubscriptionCount(chainId: number, count: number) {
    this.subscriptionGaugePerNetId[chainId] = count;
  }

  static dumpMetrics(): string {
    let result = "";
    result += this.formatGauge(
      "connectionState",
      this.connectionStateGaugePerNetId
    );
    result += this.formatCounter(
      "connectionLoss",
      this.connectionLostCounterPerNetId
    );
    result += this.formatCounter(
      "connectionFailed",
      this.connectionFailedCounterPerNetId
    );
    result += this.formatGauge("workerState", this.workerStateGaugePerNetId);
    result += this.formatCounter("requestSent", this.requestCounterPerNetId);
    result += this.formatCounter(
      "requestReplied",
      this.requestResponseCounterPerNetId
    );
    result += this.formatCounter(
      "requestFailed",
      this.requestErrorCounterPerNetId
    );
    result += this.formatCounter("eventsReceived", this.eventCounterPerNetId);
    result += this.formatGauge("subscriptions", this.subscriptionGaugePerNetId);
    return result;
  }

  static formatGauge(name: string, data: Record<number, number>): string {
    return this.format(name, data, "gauge");
  }

  static formatCounter(name: string, data: Record<number, number>): string {
    return this.format(name, data, "counter");
  }

  static format(
    name: string,
    data: Record<number, number>,
    kind: "gauge" | "counter"
  ): string {
    if (Object.entries(data).length === 0) return "";

    let result = `# TYPE ${name} ${kind}\n`;
    for (const [chainId, value] of Object.entries(data)) {
      result += `${name} {chainId="${chainId}"} ${value}\n`;
    }

    return result;
  }
}
