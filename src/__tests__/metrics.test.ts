import { Metrics } from "../metrics";

describe("Metrics", () => {
  const chainId = 1337;

  beforeEach(() => {
    Metrics.reset();
  });

  it("should add entries for a new chainId if needed and remove everything upon reset", () => {
    expect(Metrics.connectionStateGaugePerNetId[chainId]).toBeUndefined();
    expect(Metrics.connectionLostCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.connectionFailedCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.workerStateGaugePerNetId[chainId]).toBeUndefined();
    expect(Metrics.requestCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.requestResponseCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.requestErrorCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.eventCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.subscriptionGaugePerNetId[chainId]).toBeUndefined();
    expect(Metrics.gqlSubscriptionGaugePerNetId[chainId]).toBeUndefined();

    Metrics.chainInit(chainId);

    expect(Metrics.connectionStateGaugePerNetId[chainId]).toBe(0);
    expect(Metrics.connectionLostCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.connectionFailedCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.workerStateGaugePerNetId[chainId]).toBe(0);
    expect(Metrics.requestCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.requestResponseCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.requestErrorCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.eventCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.subscriptionGaugePerNetId[chainId]).toBe(0);
    expect(Metrics.gqlSubscriptionGaugePerNetId[chainId]).toBe(0);

    Metrics.reset();

    expect(Metrics.connectionStateGaugePerNetId[chainId]).toBeUndefined();
    expect(Metrics.connectionLostCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.connectionFailedCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.workerStateGaugePerNetId[chainId]).toBeUndefined();
    expect(Metrics.requestCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.requestResponseCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.requestErrorCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.eventCounterPerNetId[chainId]).toBeUndefined();
    expect(Metrics.subscriptionGaugePerNetId[chainId]).toBeUndefined();
    expect(Metrics.gqlSubscriptionGaugePerNetId[chainId]).toBeUndefined();
  });

  it("should update metrics after connected", () => {
    Metrics.chainInit(chainId);
    Metrics.connected(chainId);

    expect(Metrics.connectionStateGaugePerNetId[chainId]).toBe(1);

    Metrics.connected(chainId);

    expect(Metrics.connectionStateGaugePerNetId[chainId]).toBe(1);
  });

  it("should update metrics after connectionFailed", () => {
    Metrics.chainInit(chainId);
    Metrics.connectionFailed(chainId);

    expect(Metrics.connectionFailedCounterPerNetId[chainId]).toBe(1);

    Metrics.connectionFailed(chainId);

    expect(Metrics.connectionFailedCounterPerNetId[chainId]).toBe(2);
  });

  it("should update metrics after connectionFailed", () => {
    Metrics.chainInit(chainId);
    Metrics.connectionFailed(chainId);

    expect(Metrics.connectionFailedCounterPerNetId[chainId]).toBe(1);

    Metrics.connectionFailed(chainId);

    expect(Metrics.connectionFailedCounterPerNetId[chainId]).toBe(2);
  });

  it("should update metrics after disconnect", () => {
    Metrics.chainInit(chainId);
    Metrics.disconnected(chainId);

    expect(Metrics.connectionLostCounterPerNetId[chainId]).toBe(1);
    expect(Metrics.connectionStateGaugePerNetId[chainId]).toBe(0);

    Metrics.disconnected(chainId);

    expect(Metrics.connectionLostCounterPerNetId[chainId]).toBe(2);
    expect(Metrics.connectionStateGaugePerNetId[chainId]).toBe(0);
  });

  it("should update worker state after started or stopped", () => {
    Metrics.chainInit(chainId);
    Metrics.workerStarted(chainId);

    expect(Metrics.workerStateGaugePerNetId[chainId]).toBe(1);

    Metrics.workerStarted(chainId);

    expect(Metrics.workerStateGaugePerNetId[chainId]).toBe(1);

    Metrics.workerStopped(chainId);

    expect(Metrics.workerStateGaugePerNetId[chainId]).toBe(0);

    Metrics.workerStopped(chainId);

    expect(Metrics.workerStateGaugePerNetId[chainId]).toBe(0);
  });

  it("should update request counters", () => {
    Metrics.chainInit(chainId);

    expect(Metrics.requestCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.requestResponseCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.requestErrorCounterPerNetId[chainId]).toBe(0);

    Metrics.requestSent(chainId);

    expect(Metrics.requestCounterPerNetId[chainId]).toBe(1);
    expect(Metrics.requestResponseCounterPerNetId[chainId]).toBe(0);
    expect(Metrics.requestErrorCounterPerNetId[chainId]).toBe(0);

    Metrics.requestReplied(chainId);

    expect(Metrics.requestCounterPerNetId[chainId]).toBe(1);
    expect(Metrics.requestResponseCounterPerNetId[chainId]).toBe(1);
    expect(Metrics.requestErrorCounterPerNetId[chainId]).toBe(0);

    Metrics.requestFailed(chainId);

    expect(Metrics.requestCounterPerNetId[chainId]).toBe(1);
    expect(Metrics.requestResponseCounterPerNetId[chainId]).toBe(1);
    expect(Metrics.requestErrorCounterPerNetId[chainId]).toBe(1);
  });

  it("should update events counters", () => {
    Metrics.chainInit(chainId);

    expect(Metrics.eventCounterPerNetId[chainId]).toBe(0);

    Metrics.eventReceived(chainId);

    expect(Metrics.eventCounterPerNetId[chainId]).toBe(1);

    Metrics.eventReceived(chainId);

    expect(Metrics.eventCounterPerNetId[chainId]).toBe(2);
  });

  it("should update subscriptions counters", () => {
    Metrics.chainInit(chainId);

    expect(Metrics.subscriptionGaugePerNetId[chainId]).toBe(0);

    Metrics.setSubscriptionCount(chainId, 5);

    expect(Metrics.subscriptionGaugePerNetId[chainId]).toBe(5);
  });

  it("should dump prometheus formatted metrics", () => {
    Metrics.chainInit(chainId);

    Metrics.connected(chainId);
    Metrics.connectionFailed(chainId);
    Metrics.connectionFailed(chainId);
    Metrics.disconnected(chainId);

    Metrics.workerStarted(chainId);
    Metrics.workerStarted(chainId);
    Metrics.workerStarted(chainId);
    Metrics.workerStopped(chainId);

    Metrics.requestSent(chainId);
    Metrics.requestSent(chainId);
    Metrics.requestReplied(chainId);
    Metrics.requestReplied(chainId);
    Metrics.requestReplied(chainId);
    Metrics.requestFailed(chainId);

    Metrics.eventReceived(chainId);
    Metrics.eventReceived(chainId);
    Metrics.eventReceived(chainId);
    Metrics.eventReceived(chainId);

    Metrics.setSubscriptionCount(chainId, 5);
    Metrics.setGqlSubscriptionCount(chainId, 6);
    Metrics.setPendingRequestsGauge(chainId, 7);

    expect(Metrics.dumpMetrics()).toBe(
      '# TYPE connectionState gauge\nconnectionState {chainId="1337"} 0\n# TYPE connectionLoss counter\nconnectionLoss {chainId="1337"} 1\n# TYPE connectionFailed counter\nconnectionFailed {chainId="1337"} 2\n# TYPE workerState gauge\nworkerState {chainId="1337"} 0\n# TYPE requestSent counter\nrequestSent {chainId="1337"} 2\n# TYPE requestReplied counter\nrequestReplied {chainId="1337"} 3\n# TYPE requestFailed counter\nrequestFailed {chainId="1337"} 1\n# TYPE eventsReceived counter\neventsReceived {chainId="1337"} 4\n# TYPE subscriptions gauge\nsubscriptions {chainId="1337"} 5\n# TYPE gqlSubscriptions gauge\ngqlSubscriptions {chainId="0"} 0\ngqlSubscriptions {chainId="1337"} 6\n# TYPE pendingRequests gauge\npendingRequests {chainId="1337"} 7\n',
    );
  });
});
