import { BigNumber } from "ethers";
import { formatDate } from "./format";

export class DateWrapper {
  private readonly _isSet: boolean = false;
  private readonly _timestamp: number = 0;
  private readonly _blockchainTimestamp: number = 0;
  private readonly _date: Date;

  static readonly SECONDS_IN_DAY = 86400;

  constructor(timestamp?: number) {
    if (timestamp !== undefined) {
      this._isSet = true;
      this._blockchainTimestamp = Math.floor(timestamp / 1000);
      this._timestamp = this._blockchainTimestamp * 1000;
    }
    this._date = new Date(this._timestamp);
  }

  static fromBlockchainTimestamp(
    blockchainTimestamp: number | BigNumber
  ): DateWrapper {
    if (
      blockchainTimestamp instanceof BigNumber &&
      blockchainTimestamp.isZero()
    ) {
      return new DateWrapper();
    } else if (
      typeof blockchainTimestamp === "number" &&
      blockchainTimestamp === 0
    ) {
      return new DateWrapper();
    }

    return new DateWrapper(
      (blockchainTimestamp instanceof BigNumber
        ? blockchainTimestamp.toNumber()
        : blockchainTimestamp) * 1000
    );
  }

  static fromTimestamp(timestamp: number): DateWrapper {
    if (timestamp === 0) {
      return new DateWrapper();
    }

    return new DateWrapper(timestamp);
  }

  static fromString(dateString: string): DateWrapper {
    return DateWrapper.fromTimestamp(new Date(dateString).getTime());
  }

  static now(delta = 0): DateWrapper {
    return new DateWrapper(new Date().getTime() + delta);
  }

  static nowDate(delta = 0): DateWrapper {
    const nowDate = new Date();
    nowDate.setHours(0);
    nowDate.setMinutes(0);
    nowDate.setSeconds(0);
    nowDate.setMilliseconds(0);

    return new DateWrapper(nowDate.getTime() + delta);
  }

  static days(n: number | BigNumber): DateWrapper {
    return DateWrapper.fromBlockchainTimestamp(
      (n instanceof BigNumber ? n.toNumber() : n) * DateWrapper.SECONDS_IN_DAY
    );
  }

  get isSet(): boolean {
    return this._isSet;
  }

  get timestamp(): number {
    return this._timestamp;
  }

  get blockchainTimestamp(): number {
    return this._blockchainTimestamp;
  }

  get date(): Date {
    return this._date;
  }

  private checkIsSet(): void {
    if (!this.isSet) throw new Error("Cannot compare unset Date !");
  }

  isBefore(date: DateWrapper): boolean {
    this.checkIsSet();
    return this.timestamp < date.timestamp;
  }

  isAfter(date: DateWrapper): boolean {
    this.checkIsSet();
    return this.timestamp > date.timestamp;
  }

  isAfterOrEqual(date: DateWrapper): boolean {
    this.checkIsSet();
    return this.timestamp >= date.timestamp;
  }

  isFuture(): boolean {
    return this.isAfter(DateWrapper.now());
  }

  isFutureOrEqualDate(): boolean {
    return this.isAfterOrEqual(DateWrapper.nowDate());
  }

  isPast(): boolean {
    return this.isBefore(DateWrapper.now());
  }

  toString(): string {
    return this.isSet ? formatDate(this.date) : "N/A";
  }

  toDurationString(): string {
    if (!this.isSet) return "N/A";

    const DAY = 86400 * 1000;
    const HOUR = 3600 * 1000;
    const MINUTE = 60 * 1000;

    let result = "";
    let ts = this.timestamp;

    if (ts >= DAY) {
      result += `${Math.floor(ts / DAY)} day(s) `;
      ts %= DAY;
    }
    if (ts >= HOUR) {
      result += `${Math.floor(ts / HOUR)} hour(s) `;
      ts %= HOUR;
    }
    if (ts >= MINUTE) {
      result += `${Math.floor(ts / MINUTE)} minute(s)`;
    }

    return result;
  }
}
