/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable accessor-pairs */
/* eslint-disable @typescript-eslint/adjacent-overload-signatures */
/* eslint-disable @typescript-eslint/class-literal-property-style */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
"use strict";

import { type Network, type Networkish } from "@ethersproject/networks";
import { BigNumber } from "ethers";

import { type Event } from "@ethersproject/providers/lib/base-provider";
import { type InflightRequest, type Subscription } from "@ethersproject/providers/lib/websocket-provider";
import { ethers } from "ethers";
import type { Logger } from "pino";
import type { ErrorEvent, MessageEvent } from "ws";
import { WebSocket } from "ws";
import { Metrics } from "../metrics";
import { rootLogger } from "../rootLogger";

interface IdInflightRequest extends InflightRequest {
  id: number;
}

interface AutoWebSocketProviderOptions {
  maxParallelRequests: number;
  maxRetryCount: number;
  retryDelayMs: number;
  pingDelayMs: number;
  pongMaxWaitMs: number;
}

const DEFAULTS: AutoWebSocketProviderOptions = {
  maxParallelRequests: 4,
  maxRetryCount: 3,
  retryDelayMs: 50,
  pingDelayMs: 3000,
  pongMaxWaitMs: 6000,
};

/**
 *  Notes:
 *
 *  This provider differs a bit from the polling providers. One main
 *  difference is how it handles consistency. The polling providers
 *  will stall responses to ensure a consistent state, while this
 *  WebSocket provider assumes the connected backend will manage this.
 *
 *  For example, if a polling provider emits an event which indicates
 *  the event occurred in blockhash XXX, a call to fetch that block by
 *  its hash XXX, if not present will retry until it is present. This
 *  can occur when querying a pool of nodes that are mildly out of sync
 *  with each other.
 */

let NextId = 1;

// For more info about the Real-time Event API see:
//   https://geth.ethereum.org/docs/rpc/pubsub

export class AutoWebSocketProvider extends ethers.providers.JsonRpcProvider {
  private readonly log: Logger;

  readonly _websocket: WebSocket;
  readonly _requests: IdInflightRequest[];
  readonly _detectNetwork: Promise<Network>;

  // Maps event tag to subscription ID (we dedupe identical events)
  readonly _subIds: Record<string, Promise<string>>;

  // Maps Subscription ID to Subscription
  readonly _subs: Record<string, Subscription>;

  _retryCount: number;

  readonly chainId: number;
  readonly index: number;
  readonly options: AutoWebSocketProviderOptions;

  _wsReady: boolean;

  private _pingInterval: NodeJS.Timeout | undefined;
  private _pongTimeout: NodeJS.Timeout | undefined;
  private fauxPoll: NodeJS.Timeout;

  private readonly oncloseListener = (...args: any[]) => {
    this.emit("error", ...args);
  };

  private readonly onerrorListener = (event: ErrorEvent) => {
    this.emit("error", "WebSocket closed", event);
  };

  private readonly onopenListener = () => {
    // Stall sending requests until the socket is open...
    this._wsReady = true;
    this._setupPings();
    Metrics.connected(this.chainId);
    if (this._requests.length > 0) {
      this._sendLastRequest();
    }
  };

  private readonly onmessageListener = (messageEvent: MessageEvent) => {
    const data = messageEvent.data as string;
    try {
      const result = JSON.parse(data);
      if (result.id != null && result.id !== 0) {
        this._onRequestResponse(data, result);
      } else if (result.method === "eth_subscription") {
        this._onSubscriptionMessage(result);
      } else if (result.error && result.error.code === 429) {
        this._onRateLimitingError();
      } else {
        Metrics.requestFailed(this.chainId);

        this.log.warn({
          msg: "Unknown error handling message",
          action: "error",
          messageEvent,
        });

        this.log.warn({ msg: "this should not happen" });
      }
    } catch (err) {
      this.log.warn({
        msg: "Message is not valid JSON, will retry later",
        data,
      });
      this._onRateLimitingError();
      Metrics.requestFailed(this.chainId);
    }
  };

  private onpongListener: ((this: WebSocket, ...args: any[]) => void) | undefined;

  constructor(
    url: string,
    options: Partial<AutoWebSocketProviderOptions> & { chainId: number; providerIndex: number },
    network?: Networkish,
  ) {
    super(url, network);

    this.chainId = options.chainId;
    this.index = options.providerIndex;
    this._retryCount = 0;

    this.log = rootLogger.child({ chainId: this.chainId, name: "Provider", index: this.index });

    this.options = {
      ...DEFAULTS,
      ...options,
    };

    this._pollingInterval = -1;

    this._wsReady = false;

    this._websocket = new WebSocket(this.connection.url);

    this._requests = [];
    this._subs = {};
    this._subIds = {};

    this._detectNetwork = super.detectNetwork().catch((err) => {
      this.log.error({ msg: "Fatal error !", err });
      return err;
    });

    this._websocket.onerror = this.onerrorListener;
    this._websocket.onclose = this.oncloseListener;
    this._websocket.onopen = this.onopenListener;
    this._websocket.onmessage = this.onmessageListener;

    // This Provider does not actually poll, but we want to trigger
    // poll events for things that depend on them (like stalling for
    // block and transaction lookups)
    this.fauxPoll = setInterval(() => {
      this.emit("poll");
    }, 1000);
    if (this.fauxPoll.unref) {
      this.fauxPoll.unref();
    }
  }

  get pingInterval(): NodeJS.Timeout | undefined {
    return this._pingInterval;
  }
  get pongTimeout(): NodeJS.Timeout | undefined {
    return this._pongTimeout;
  }

  _onRequestResponse(data: string, result: any) {
    const request = this._requests.shift()!;
    Metrics.setPendingRequestsGauge(this.chainId, this._requests.length);

    if (result.result !== undefined) {
      Metrics.requestReplied(this.chainId);

      this.log.trace({
        action: "response",
        request: JSON.parse(request.payload),
        response: result.result,
      });

      request.callback(null as unknown as Error, result.result);
    } else {
      Metrics.requestFailed(this.chainId);

      let error: Error | null = null;
      if (result.error) {
        error = new Error(result.error.message || "unknown error");
        Object.defineProperty(error, "code", { enumerable: true, value: result.error.code || null, writable: false });
        Object.defineProperty(error, "response", { enumerable: true, value: data, writable: false });
      } else {
        error = new Error("unknown error");
      }

      this.log.trace({
        action: "response",
        error,
        request: JSON.parse(request.payload),
      });

      request.callback(error, undefined);
    }

    this._retryCount = 0;
    this._sendLastRequest();
  }

  _onSubscriptionMessage(result: any) {
    this.log.trace({
      action: "subscribe",
      result,
    });

    Metrics.eventReceived(this.chainId);

    // Subscription...
    const sub = this._subs[result.params.subscription];
    if (sub) {
      // this.emit.apply(this,                  );
      sub.processFunc(result.params.result);
    }
  }

  _onRateLimitingError() {
    this.log.warn("Rate limiting error caught, programming retry of last request");

    Metrics.requestFailed(this.chainId);

    setTimeout(() => {
      this._sendLastRequest();
    }, this.options.retryDelayMs);
  }

  // Cannot narrow the type of _websocket, as that is not backwards compatible
  // so we add a getter and let the WebSocket be a public API.
  get websocket(): WebSocket {
    return this._websocket;
  }

  async detectNetwork(): Promise<Network> {
    return await this._detectNetwork;
  }

  get pollingInterval(): number {
    return 0;
  }

  resetEventsBlock(blockNumber: number): void {
    throw new Error("cannot reset events block on AutoWebSocketProvider");
  }

  set pollingInterval(value: number) {
    throw new Error("cannot set polling interval on AutoWebSocketProvider");
  }

  async poll(): Promise<void> {}

  set polling(value: boolean) {
    if (!value) {
      return;
    }

    throw new Error("cannot set polling on AutoWebSocketProvider");
  }

  async send(method: string, params?: any[]): Promise<any> {
    const id = NextId++;

    this.log.trace({
      action: "prepare-request",
      id,
      method,
      params,
    });

    return await new Promise((resolve, reject) => {
      function callback(error: Error, result: any) {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }

      const payload = JSON.stringify({
        method,
        params,
        id,
        jsonrpc: "2.0",
      });

      this.log.trace({
        action: "queue-request",
        request: JSON.parse(payload),
      });

      this._requests.push({ id, callback, payload });
      Metrics.setPendingRequestsGauge(this.chainId, this._requests.length);

      if (this._requests.length === 1) {
        this._sendLastRequest();
      }
    });
  }

  static defaultUrl(): string {
    return "ws://localhost:8546";
  }

  async _subscribe(tag: string, param: any[], processFunc: (result: any) => void): Promise<void> {
    let subIdPromise = this._subIds[tag];
    if (subIdPromise == null) {
      subIdPromise = Promise.all(param).then(async (param) => {
        return await this.send("eth_subscribe", param);
      });
      this._subIds[tag] = subIdPromise;
    }
    const subId = await subIdPromise;
    this._subs[subId] = { tag, processFunc };
    Metrics.setSubscriptionCount(this.chainId, Object.keys(this._subIds).length);
  }

  _startEvent(event: Event): void {
    switch (event.type) {
      case "block":
        this._subscribe("block", ["newHeads"], (result: any) => {
          const blockNumber = BigNumber.from(result.number).toNumber();
          this._emitted.block = blockNumber;
          this.emit("block", blockNumber);
        });
        break;

      case "pending":
        this._subscribe("pending", ["newPendingTransactions"], (result: any) => {
          this.emit("pending", result);
        });
        break;

      case "filter":
        this._subscribe(event.tag, ["logs", this._getFilter(event.filter)], (result: any) => {
          if (result.removed == null) {
            result.removed = false;
          }
          this.emit(event.filter, this.formatter.filterLog(result));
        });
        break;

      case "tx": {
        const emitReceipt = (event: Event) => {
          const hash = event.hash;
          this.getTransactionReceipt(hash).then((receipt) => {
            if (!receipt) {
              return;
            }
            this.emit(hash, receipt);
          });
        };

        // In case it is already mined
        emitReceipt(event);

        // To keep things simple, we start up a single newHeads subscription
        // to keep an eye out for transactions we are watching for.
        // Starting a subscription for an event (i.e. "tx") that is already
        // running is (basically) a nop.
        this._subscribe("tx", ["newHeads"], (result: any) => {
          this._events.filter((e) => e.type === "tx").forEach(emitReceipt);
        });
        break;
      }

      // Nothing is needed
      case "debug":
      case "poll":
      case "willPoll":
      case "didPoll":
      case "error":
        break;

      default:
        console.log("unhandled:", event);
        break;
    }
  }

  _stopEvent(event: Event): void {
    let tag = event.tag;

    if (event.type === "tx") {
      // There are remaining transaction event listeners
      if (this._events.filter((e) => e.type === "tx").length > 0) {
        return;
      }
      tag = "tx";
    } else if (this.listenerCount(event.event)) {
      // There are remaining event listeners
      return;
    }

    const subId = this._subIds[tag];
    if (!subId) {
      return;
    }

    delete this._subIds[tag];
    subId.then((subId) => {
      if (!this._subs[subId]) {
        return;
      }
      delete this._subs[subId];
      Metrics.setSubscriptionCount(this.chainId, Object.keys(this._subIds).length);
      this.send("eth_unsubscribe", [subId]);
    });
  }

  async destroy(): Promise<void> {
    clearInterval(this.fauxPoll);
    if (this._pingInterval !== undefined) {
      this.log.info("Stopping ping interval");

      clearInterval(this._pingInterval);
      this._pingInterval = undefined;
    }
    if (this._pongTimeout !== undefined) {
      this.log.info("Stopping pending pong timeout");

      clearTimeout(this._pongTimeout);
      this._pongTimeout = undefined;
    }

    // Wait until we have connected before trying to disconnect
    /* TODO remove if it proves useless
    if (this.websocket.readyState === WebSocket.CONNECTING) {
      await new Promise((resolve) => {
        this.websocket.onopen = () => {
          Metrics.connected(this.chainId);
          resolve(true);
        };

        this.websocket.onerror = () => {
          Metrics.disconnected(this.chainId);
          resolve(false);
        };
      });
    }
    */

    // Hangup
    // See: https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent#Status_codes
    Metrics.disconnected(this.chainId);

    if (this.onpongListener !== undefined) {
      this._websocket.off("pong", this.onpongListener);
      this.onpongListener = undefined;
    }

    this._websocket.close(1000);
    this._websocket.terminate();
  }

  private _sendLastRequest() {
    if (this._requests.length === 0) return;

    const request = this._requests[0];
    this._retryCount++;

    if (this._retryCount > this.options.maxRetryCount) {
      this.log.warn({
        msg: "found exceeded retries for request",
        payload: request.payload,
        retryCount: this._retryCount,
        maxRetryCount: this.options.maxRetryCount,
      });
      throw new Error("Too many retries failed, crashing");
    }

    this._websocket.send(request.payload);
    this.log.trace({
      action: "send-request",
      payload: JSON.parse(request.payload),
      request,
    });

    Metrics.requestSent(this.chainId);
  }

  private _setupPings() {
    this.log.info("setting ping timers on provider");

    let now: Date;

    this._pingInterval = setInterval(() => {
      if (this._pongTimeout === undefined) {
        now = new Date();

        this.log.trace({
          msg: "ping",
          now: now.toISOString(),
        });
        this._websocket.ping();

        this._pongTimeout = setTimeout(() => {
          this.log.warn({
            msg: "pong timeout, Websocket crashed",
            now: now.toISOString(),
            maxWaitMs: this.options.pongMaxWaitMs,
          });

          this.destroy();
        }, this.options.pongMaxWaitMs);
      } else {
        this.log.warn({
          msg: "still waiting for previous pong",
          now: now.toISOString(),
        });
      }
    }, this.options.pingDelayMs);

    this.onpongListener = () => {
      if (this._pongTimeout !== undefined) {
        this.log.trace({
          msg: "pong",
          now: now.toISOString(),
          pongDelayMs: new Date().getTime() - now.getTime(),
        });

        clearTimeout(this._pongTimeout);
        this._pongTimeout = undefined;
      }
    };

    this._websocket.on("pong", this.onpongListener);
  }
}
