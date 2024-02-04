import {
  ChargedTokenModel,
  DelegableToLTModel,
  DirectoryModel,
  EventModel,
  IEvent,
  IInterfaceProjectToken,
  IUserBalance,
  InterfaceProjectTokenModel,
  UserBalanceModel,
} from ".";
import { EventHandlerStatus } from "../globals";
import { AbstractDbRepository } from "../loaders/AbstractDbRepository";
import { DataType, IContract, IModel } from "../types";

export class DbRepository extends AbstractDbRepository {
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

  async get<T>(dataType: DataType, chainId: number, address: string): Promise<T | null> {
    const model = this.getModelByDataType(dataType);

    const result = await model.findOne({
      chainId,
      address,
    });

    if (result === null) return null;

    return result.toObject();
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

    return result.map((doc) => doc.toObject());
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
    }
  }
}
