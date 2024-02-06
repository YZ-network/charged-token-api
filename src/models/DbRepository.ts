import {
  AbstractDbRepository,
  DataType,
  EventHandlerStatus,
  IContract,
  IDirectory,
  IEvent,
  IInterfaceProjectToken,
  IUserBalance,
} from "../loaders";
import { rootLogger } from "../rootLogger";
import { ChargedTokenModel } from "./ChargedToken";
import { DelegableToLTModel } from "./DelegableToLT";
import { DirectoryModel } from "./Directory";
import { EventModel } from "./Event";
import { InterfaceProjectTokenModel } from "./InterfaceProjectToken";
import { UserBalanceModel } from "./UserBalances";
import { IModel } from "./types";

export class DbRepository extends AbstractDbRepository {
  private readonly log = rootLogger.child({ name: "DbRepository" });

  async exists(dataType: DataType, chainId: number, address: string): Promise<boolean> {
    const model = this.getModelByDataType(dataType);

    return (
      (await model.exists({
        chainId,
        address,
      })) !== null
    );
  }

  async existsBalance(chainId: number, address: string, user: string): Promise<boolean> {
    return (
      (await UserBalanceModel.exists({
        chainId,
        address,
        user,
      })) !== null
    );
  }

  async existsEvent(
    chainId: number,
    address: string,
    blockNumber: number,
    txIndex: number,
    logIndex: number,
  ): Promise<boolean> {
    return (
      (await EventModel.exists({
        chainId,
        address,
        blockNumber,
        txIndex,
        logIndex,
      })) !== null
    );
  }

  async isUserBalancesLoaded(chainId: number, user: string): Promise<boolean> {
    const contractsCount = await ChargedTokenModel.count({ chainId });
    const balancesCount = await UserBalanceModel.count({ chainId, user });
    return contractsCount === balancesCount;
  }

  async countEvents(chainId: number): Promise<number> {
    return await EventModel.count({ chainId });
  }

  async get<T>(dataType: DataType, chainId: number, address: string): Promise<T | null> {
    const model = this.getModelByDataType(dataType);

    const result = await model.findOne({
      chainId,
      address,
    });

    if (result === null) return null;

    return result.toObject();
  }

  async getAllMatching<T extends IContract>(dataType: DataType, filter: Partial<T> & Pick<T, "chainId">): Promise<T[]> {
    const model = this.getModelByDataType(dataType);

    const result = await model.find(filter);

    return result.map((doc) => doc.toObject());
  }

  async getDirectory(chainId: number): Promise<IDirectory | null> {
    return await DirectoryModel.findOne({ chainId });
  }

  async getInterfaceByChargedToken(chainId: number, ctAddress: string): Promise<IInterfaceProjectToken | null> {
    const result = await InterfaceProjectTokenModel.findOne({
      chainId,
      liquidityToken: ctAddress,
    });

    if (result === null) return null;

    return result.toObject();
  }

  async getBalances(chainId: number, user: string): Promise<IUserBalance[]> {
    const result = await UserBalanceModel.find({
      chainId,
      user,
    });

    if (result === null) return [];

    return result.map((doc) => doc.toObject());
  }

  async getBalance(chainId: number, address: string, user: string): Promise<IUserBalance | null> {
    const result = await UserBalanceModel.findOne({
      chainId,
      address,
      user,
    });

    if (result === null) return null;

    return result.toObject();
  }

  async getBalancesByProjectToken(chainId: number, ptAddress: string, user: string): Promise<IUserBalance[]> {
    const result = await UserBalanceModel.find({
      chainId,
      ptAddress,
      user,
    });

    if (result === null) return [];

    return result.map((doc: any) => doc.toObject());
  }

  async getAllEvents(): Promise<IEvent[]> {
    const result = await EventModel.find().sort({ blockNumber: "asc", txIndex: "asc", logIndex: "asc" });

    return result.map((doc: any) => doc.toObject());
  }

  async getEventsPaginated(chainId: number, count: number, offset: number): Promise<IEvent[]> {
    const result = await EventModel.find({ chainId })
      .limit(count)
      .skip(offset)
      .sort({ blockNumber: "asc", txIndex: "asc", logIndex: "asc" });

    return result.map((doc: any) => doc.toObject());
  }

  async save<T extends IContract>(dataType: DataType, data: T): Promise<void> {
    if (await this.exists(dataType, data.chainId, data.address)) {
      throw new Error("Tried to create a duplicate document !");
    }

    const model = this.getModelByDataType(dataType);

    await new model(data).save();
  }

  async saveBalance(data: IUserBalance): Promise<void> {
    if (await this.existsBalance(data.chainId, data.address, data.user)) {
      throw new Error("Tried to create a duplicate document !");
    }

    await new UserBalanceModel(data).save();
  }

  async saveEvent(data: IEvent): Promise<void> {
    await new EventModel(data).save();
  }

  async update<T extends IContract>(
    dataType: DataType,
    data: Partial<T> & Pick<IContract, "chainId" | "address" | "lastUpdateBlock">,
  ): Promise<void> {
    if (!(await this.exists(dataType, data.chainId, data.address))) {
      throw new Error("Tried updating a non-existing document !");
    }

    const model = this.getModelByDataType(dataType);

    await model.updateOne({ chainId: data.chainId, address: data.address }, data);
  }

  async updateBalance(
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "address" | "lastUpdateBlock">,
  ): Promise<void> {
    if (!(await this.exists(DataType.UserBalance, data.chainId, data.address))) {
      throw new Error("Tried updating a non-existing document !");
    }

    await UserBalanceModel.updateOne({ chainId: data.chainId, address: data.address }, data);
  }

  async updateOtherBalancesByProjectToken(
    addressToExclude: string,
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "lastUpdateBlock" | "ptAddress">,
  ): Promise<void> {
    await UserBalanceModel.updateMany(
      { chainId: data.chainId, address: { $ne: addressToExclude }, user: data.user },
      data,
    );
  }

  async updateEventStatus(
    event: Pick<IEvent, "chainId" | "address" | "blockNumber" | "txIndex" | "logIndex">,
    newStatus: EventHandlerStatus,
  ): Promise<void> {
    await EventModel.updateOne(event, {
      status: newStatus,
    });
  }

  async delete<T extends IContract>(dataType: DataType, chainId: number, address: string | string[]): Promise<void> {
    const model = this.getModelByDataType(dataType);

    if (typeof address === "string") {
      await model.deleteOne({ chainId, address });
    } else {
      await model.deleteMany({ chainId, address: { $in: address } });
    }
  }

  async deletePendingAndFailedEvents(chainId: number): Promise<void> {
    const pendingEvents = await EventModel.find({
      chainId,
      status: EventHandlerStatus.QUEUED,
    });
    const failedEvents = await EventModel.find({
      chainId,
      status: EventHandlerStatus.FAILURE,
    });
    if (pendingEvents.length > 0) {
      this.log.warn({
        msg: `Found ${pendingEvents.length} pending events ! will remove them`,
        chainId,
      });
    }
    if (failedEvents.length > 0) {
      this.log.warn({
        msg: `Found ${failedEvents.length} failed events ! will remove them`,
        events: failedEvents.map((event: any) => event.toJSON()),
        chainId,
      });
    }
    await EventModel.deleteMany({
      chainId,
      status: { $in: [EventHandlerStatus.QUEUED, EventHandlerStatus.FAILURE] },
    });
  }

  private getModelByDataType(dataType: DataType): IModel<any> {
    switch (dataType) {
      case DataType.ChargedToken:
        return ChargedTokenModel;
      case DataType.InterfaceProjectToken:
        return InterfaceProjectTokenModel;
      case DataType.Directory:
        return DirectoryModel;
      case DataType.DelegableToLT:
        return DelegableToLTModel;
      case DataType.UserBalance:
        return UserBalanceModel;
      default:
        throw new Error(`Unhandled data type : ${dataType}`);
    }
  }
}
