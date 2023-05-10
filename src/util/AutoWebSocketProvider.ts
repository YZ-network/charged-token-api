"use strict";

import { BigNumber } from "@ethersproject/bignumber";
import { Network, Networkish } from "@ethersproject/networks";
import { defineReadOnly } from "@ethersproject/properties";

import { JsonRpcProvider } from "@ethersproject/providers";
import { Event } from "@ethersproject/providers/lib/base-provider";
import {
  InflightRequest,
  Subscription,
  WebSocketLike,
} from "@ethersproject/providers/lib/websocket-provider";
import { WebSocket } from "ws";
import { rootLogger } from "./rootLogger";

const logger = rootLogger.child({ name: "AutoWebSocketProvider" });

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

export class AutoWebSocketProvider extends JsonRpcProvider {
  readonly _websocket: WebSocket;
  readonly _requests: IdInflightRequest[];
  readonly _detectNetwork: Promise<Network>;

  // Maps event tag to subscription ID (we dedupe identical events)
  readonly _subIds: { [tag: string]: Promise<string> };

  // Maps Subscription ID to Subscription
  readonly _subs: { [name: string]: Subscription };

  _retryCount: number;

  readonly options: AutoWebSocketProviderOptions;

  _wsReady: boolean;

  private pingInterval: NodeJS.Timer | undefined;
  private pongTimeout: NodeJS.Timeout | undefined;

  constructor(
    url: string | WebSocketLike,
    options: Partial<AutoWebSocketProviderOptions> = {},
    network?: Networkish
  ) {
    // This will be added in the future; please open an issue to expedite
    if (network === "any") {
      throw new Error(
        "AutoWebSocketProvider does not support 'any' network yet"
      );
    }

    if (typeof url === "string") {
      super(url, network);
    } else {
      super("_websocket", network);
    }

    this.options = {
      ...DEFAULTS,
      ...options,
    };

    this._pollingInterval = -1;

    this._wsReady = false;

    if (typeof url === "string") {
      this._websocket = new WebSocket(this.connection.url);
    } else if (url instanceof WebSocket) {
      this._websocket = url;
    } else {
      throw Error(
        "This provider only accepts websocket URL or a real WebSocket as parameter"
      );
    }

    this._requests = [];
    this._subs = {};
    this._subIds = {};
    this._retryCount = 0;
    this._detectNetwork = super.detectNetwork();

    this.websocket.onerror = (...args) => {
      this.emit("error", ...args);
    };
    this._websocket.onclose = (event) => {
      this.emit("error", "WebSocket closed", event);
    };

    // Stall sending requests until the socket is open...
    this.websocket.onopen = () => {
      this._wsReady = true;
      this._setupPings();
      if (this._requests.length > 0) {
        this._sendLastRequest();
      }
    };

    this.websocket.onmessage = (messageEvent: { data: string }) => {
      const data = messageEvent.data;
      const result = JSON.parse(data);
      if (result.id != null && result.id !== 0) {
        this._onRequestResponse(data, result);
      } else if (result.method === "eth_subscription") {
        this._onSubscriptionMessage(result);
      } else if (result.error && result.error.code === 429) {
        this._onRateLimitingError();
      } else {
        logger.debug({
          action: "error",
          msg: "Unknown error handling message",
          messageEvent,
        });

        console.warn("this should not happen");
      }
    };

    // This Provider does not actually poll, but we want to trigger
    // poll events for things that depend on them (like stalling for
    // block and transaction lookups)
    const fauxPoll = setInterval(() => {
      this.emit("poll");
    }, 1000);
    if (fauxPoll.unref) {
      fauxPoll.unref();
    }
  }

  _onRequestResponse(data: string, result: any) {
    const request = this._requests.shift()!;

    if (result.result !== undefined) {
      logger.debug({
        action: "response",
        request: JSON.parse(request.payload),
        response: result.result,
      });

      request.callback(null as unknown as Error, result.result);
    } else {
      let error: Error | null = null;
      if (result.error) {
        error = new Error(result.error.message || "unknown error");
        defineReadOnly(<any>error, "code", result.error.code || null);
        defineReadOnly(<any>error, "response", data);
      } else {
        error = new Error("unknown error");
      }

      logger.debug({
        action: "response",
        error: error,
        request: JSON.parse(request.payload),
      });

      request.callback(error, undefined);
    }

    this._retryCount = 0;
    this._sendLastRequest();
  }

  _onSubscriptionMessage(result: any) {
    logger.debug({
      action: "subscribe",
      result,
    });

    // Subscription...
    const sub = this._subs[result.params.subscription];
    if (sub) {
      //this.emit.apply(this,                  );
      sub.processFunc(result.params.result);
    }
  }

  _onRateLimitingError() {
    logger.warn(
      "Rate limiting error caught, programming retry of last request"
    );
    setTimeout(() => this._sendLastRequest(), this.options.retryDelayMs);
  }

  // Cannot narrow the type of _websocket, as that is not backwards compatible
  // so we add a getter and let the WebSocket be a public API.
  get websocket(): WebSocketLike {
    return this._websocket;
  }

  detectNetwork(): Promise<Network> {
    return this._detectNetwork;
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

  async poll(): Promise<void> {
    return;
  }

  set polling(value: boolean) {
    if (!value) {
      return;
    }

    throw new Error("cannot set polling on AutoWebSocketProvider");
  }

  send(method: string, params?: Array<any>): Promise<any> {
    const id = NextId++;

    logger.debug({
      action: "prepare-request",
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      function callback(error: Error, result: any) {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }

      const payload = JSON.stringify({
        method: method,
        params: params,
        id,
        jsonrpc: "2.0",
      });

      logger.debug({
        action: "queue-request",
        request: JSON.parse(payload),
      });

      this._requests.push({ id, callback, payload });

      if (this._requests.length === 1) {
        this._sendLastRequest();
      }
    });
  }

  static defaultUrl(): string {
    return "ws://localhost:8546";
  }

  async _subscribe(
    tag: string,
    param: Array<any>,
    processFunc: (result: any) => void
  ): Promise<void> {
    let subIdPromise = this._subIds[tag];
    if (subIdPromise == null) {
      subIdPromise = Promise.all(param).then((param) => {
        return this.send("eth_subscribe", param);
      });
      this._subIds[tag] = subIdPromise;
    }
    const subId = await subIdPromise;
    this._subs[subId] = { tag, processFunc };
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
        this._subscribe(
          "pending",
          ["newPendingTransactions"],
          (result: any) => {
            this.emit("pending", result);
          }
        );
        break;

      case "filter":
        this._subscribe(
          event.tag,
          ["logs", this._getFilter(event.filter)],
          (result: any) => {
            if (result.removed == null) {
              result.removed = false;
            }
            this.emit(event.filter, this.formatter.filterLog(result));
          }
        );
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
      if (this._events.filter((e) => e.type === "tx").length) {
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
      this.send("eth_unsubscribe", [subId]);
    });
  }

  async destroy(): Promise<void> {
    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    if (this.pongTimeout !== undefined) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }

    // Wait until we have connected before trying to disconnect
    if (this.websocket.readyState === WebSocket.CONNECTING) {
      await new Promise((resolve) => {
        this.websocket.onopen = function () {
          resolve(true);
        };

        this.websocket.onerror = function () {
          resolve(false);
        };
      });
    }

    // Hangup
    // See: https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent#Status_codes
    this.websocket.close(1000);
  }

  private _sendLastRequest() {
    if (this._requests.length === 0) return;

    const request = this._requests[0];
    this._retryCount++;

    if (this._retryCount > this.options.maxRetryCount) {
      logger.warn(
        "found exceeded retries for request",
        request,
        ":",
        this._retryCount,
        ">",
        this.options.maxRetryCount
      );
      throw new Error("Too many retries failed, crashing");
    }

    this._websocket.send(request.payload);
    logger.debug({
      action: "send-request",
      payload: JSON.parse(request.payload),
      request,
    });
  }

  private _setupPings() {
    this.pingInterval = setInterval(() => {
      if (this.pongTimeout === undefined) {
        this._websocket.ping();
        this.pongTimeout = setTimeout(() => {
          logger.warn({
            msg: "Websocket crashed",
          });
          if (this.pingInterval !== undefined) {
            clearInterval(this.pingInterval);
            this.pingInterval = undefined;
          }
          this._websocket.terminate();
        }, this.options.pongMaxWaitMs);
      }
    }, this.options.pingDelayMs);

    this._websocket.on("pong", () => {
      if (this.pongTimeout !== undefined) {
        clearTimeout(this.pongTimeout);
        this.pongTimeout = undefined;
      }
    });
  }
}
