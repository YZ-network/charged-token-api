import mongoose, { Document, Model } from "mongoose";
import { AbstractDbRepository } from "../core/AbstractDbRepository";
import { rootLogger } from "../rootLogger";
import { ClientSession } from "../vendor";
import { ChargedTokenModel } from "./models/ChargedToken";
import { DelegableToLTModel } from "./models/DelegableToLT";
import { DirectoryModel } from "./models/Directory";
import { EventModel } from "./models/Event";
import { InterfaceProjectTokenModel } from "./models/InterfaceProjectToken";
import { UserBalanceModel } from "./models/UserBalances";

export class DbRepository extends AbstractDbRepository {
  private readonly log = rootLogger.child({ name: "DbRepository" });

  async startSession(): Promise<ClientSession> {
    return await mongoose.startSession();
  }

  async exists(
    dataType: DataType,
    chainId: number,
    address: string,
    session: ClientSession | null = null,
  ): Promise<boolean> {
    const model = this.getModelByDataType(dataType);

    return (
      (await model
        .exists({
          chainId,
          address,
        })
        .session(session)) !== null
    );
  }

  async existsBalance(
    chainId: number,
    address: string,
    user: string,
    session: ClientSession | null = null,
  ): Promise<boolean> {
    return (
      (await UserBalanceModel.exists({
        chainId,
        address,
        user,
      }).session(session)) !== null
    );
  }

  async existsEvent(
    chainId: number,
    address: string,
    blockNumber: number,
    txIndex: number,
    logIndex: number,
    session: ClientSession | null = null,
  ): Promise<boolean> {
    return (
      (await EventModel.exists({
        chainId,
        address,
        blockNumber,
        txIndex,
        logIndex,
      }).session(session)) !== null
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

  async get<T>(
    dataType: DataType,
    chainId: number,
    address: string,
    session: ClientSession | null = null,
  ): Promise<T | null> {
    const model = this.getModelByDataType(dataType);

    const result = await model
      .findOne({
        chainId,
        address,
      })
      .session(session);

    if (result === null) return null;

    return result.toJSON();
  }

  async getAllMatching<T extends IContract>(dataType: DataType, filter: Partial<T> & Pick<T, "chainId">): Promise<T[]> {
    const model = this.getModelByDataType(dataType);

    const result = await model.find(filter);

    return result.map((doc: Document) => doc.toJSON()) as T[];
  }

  async getDirectory(chainId: number): Promise<IDirectory | null> {
    const result = await DirectoryModel.findOne({ chainId });

    if (result === null) return null;

    return result.toJSON();
  }

  async getInterfaceByChargedToken(chainId: number, ctAddress: string): Promise<IInterfaceProjectToken | null> {
    const result = await InterfaceProjectTokenModel.findOne({
      chainId,
      liquidityToken: ctAddress,
    });

    if (result === null) return null;

    return result.toJSON();
  }

  async getBalances(chainId: number, user: string, session: ClientSession | null = null): Promise<IUserBalance[]> {
    const result = await UserBalanceModel.find({
      chainId,
      user,
    }).session(session);

    if (result === null) return [];

    return result.map((doc) => doc.toJSON());
  }

  async getBalance(
    chainId: number,
    address: string,
    user: string,
    session: ClientSession | null = null,
  ): Promise<IUserBalance | null> {
    const result = await UserBalanceModel.findOne({
      chainId,
      address,
      user,
    }).session(session);

    if (result === null) return null;

    return result.toJSON();
  }

  async getBalancesByProjectToken(
    chainId: number,
    ptAddress: string,
    user: string,
    session: ClientSession | null = null,
  ): Promise<IUserBalance[]> {
    const result = await UserBalanceModel.find({
      chainId,
      ptAddress,
      user,
    }).session(session);

    if (result === null) return [];

    return result.map((doc: any) => doc.toJSON());
  }

  async getPTBalance(
    chainId: number,
    ptAddress: string,
    user: string,
    session: ClientSession | null = null,
  ): Promise<string | null> {
    const result = await UserBalanceModel.findOne({
      chainId,
      ptAddress,
      user,
    }).session(session);

    if (result === null) return null;

    return result.balancePT;
  }

  async getAllEvents(): Promise<IEvent[]> {
    const result = await EventModel.find().sort({ blockNumber: "asc", txIndex: "asc", logIndex: "asc" });

    return result.map((doc: any) => doc.toJSON());
  }

  async getEventsPaginated(chainId: number, count: number, offset: number): Promise<IEvent[]> {
    const result = await EventModel.find({ chainId })
      .limit(count)
      .skip(offset)
      .sort({ blockNumber: "asc", txIndex: "asc", logIndex: "asc" });

    return result.map((doc: any) => doc.toJSON());
  }

  async isDelegableStillReferenced(chainId: number, address: string): Promise<boolean> {
    return (await InterfaceProjectTokenModel.exists({ chainId, projectToken: address })) !== null;
  }

  async save<T extends IContract>(dataType: DataType, data: T, session: ClientSession | null = null): Promise<T> {
    if (await this.exists(dataType, data.chainId, data.address, session)) {
      throw new Error("Tried to create a duplicate document !");
    }

    const model = this.getModelByDataType(dataType);

    const result = await new model(data).save({ session });

    return result.toJSON();
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
    session: ClientSession | null = null,
  ): Promise<void> {
    if (!(await this.exists(dataType, data.chainId, data.address, session))) {
      throw new Error("Tried updating a non-existing document !");
    }

    const model = this.getModelByDataType(dataType);

    await model.updateOne({ chainId: data.chainId, address: data.address }, data, { session });
  }

  async updateBalance(
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "address" | "lastUpdateBlock">,
    session: ClientSession | null = null,
  ): Promise<void> {
    if (!(await this.existsBalance(data.chainId, data.address, data.user, session))) {
      throw new Error("Tried updating a non-existing document !");
    }

    await UserBalanceModel.updateOne({ chainId: data.chainId, address: data.address, user: data.user }, data, {
      session,
    });
  }

  async updatePTBalances(
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "ptAddress" | "lastUpdateBlock">,
    session?: ClientSession,
  ): Promise<void> {
    await UserBalanceModel.updateMany({ chainId: data.chainId, ptAddress: data.ptAddress, user: data.user }, data, {
      session,
    });
  }

  async updateOtherBalancesByProjectToken(
    addressToExclude: string,
    data: Partial<IUserBalance> & Pick<IUserBalance, "user" | "chainId" | "lastUpdateBlock" | "ptAddress">,
    session: ClientSession | null = null,
  ): Promise<void> {
    await UserBalanceModel.updateMany(
      { chainId: data.chainId, ptAddress: data.ptAddress, address: { $ne: addressToExclude }, user: data.user },
      data,
      { session },
    );
  }

  async updateEventStatus(
    event: Pick<IEvent, "chainId" | "address" | "blockNumber" | "txIndex" | "logIndex">,
    newStatus: EventHandlerStatus,
    session: ClientSession | null = null,
  ): Promise<void> {
    await EventModel.updateOne(event, {
      status: newStatus,
    }).session(session);
  }

  async delete<T extends IContract>(
    dataType: DataType,
    chainId: number,
    address: string | string[],
    session: ClientSession | null = null,
  ): Promise<void> {
    const model = this.getModelByDataType(dataType);

    if (typeof address === "string") {
      await model.deleteOne({ chainId, address }, { session });
    } else {
      await model.deleteMany({ chainId, address: { $in: address } }, { session });
    }
  }

  async deletePendingAndFailedEvents(chainId: number): Promise<void> {
    const pendingEvents = await EventModel.find({
      chainId,
      status: "QUEUED",
    });
    const failedEvents = await EventModel.find({
      chainId,
      status: "FAILURE",
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
      status: { $in: ["QUEUED", "FAILURE"] },
    });
  }

  private getModelByDataType(dataType: DataType): Model<any> {
    switch (dataType) {
      case "ChargedToken":
        return ChargedTokenModel;
      case "InterfaceProjectToken":
        return InterfaceProjectTokenModel;
      case "Directory":
        return DirectoryModel;
      case "DelegableToLT":
        return DelegableToLTModel;
      case "UserBalance":
        return UserBalanceModel;
      default:
        throw new Error(`Unhandled data type : ${dataType}`);
    }
  }
}
