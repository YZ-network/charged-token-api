import { ethers } from "ethers";
import { contracts } from "../contracts";
import {
  IInterfaceProjectToken,
  InterfaceProjectTokenModel,
} from "../models/InterfaceProjectToken";
import { EMPTY_ADDRESS } from "../types";
import { AbstractLoader } from "./AbstractLoader";
import { DelegableToLT } from "./DelegableToLT";

export class InterfaceProjectToken extends AbstractLoader<IInterfaceProjectToken> {
  projectToken: DelegableToLT | undefined;

  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.InterfaceProjectToken, [
      "StartSet",
      "ProjectTokenReceived",
      "LTRecharged",
    ]);
  }

  async init() {
    await super.init();

    if (this.lastState!.projectToken !== EMPTY_ADDRESS) {
      this.projectToken = new DelegableToLT(
        this.provider,
        this.lastState!.projectToken
      );

      await this.projectToken.init();
    }
  }

  async get() {
    return await InterfaceProjectTokenModel.findOne({ address: this.address });
  }

  async load() {
    console.log("Reading interface project token @", this.address);

    const ins = this.instance;

    return {
      // contract
      lastUpdateBlock: this.actualBlock,
      address: this.address,
      // ownable
      owner: await ins.owner(),
      // other
      liquidityToken: await ins.liquidityToken(),
      projectToken: await ins.projectToken(),
      dateLaunch: (await ins.dateLaunch()).toString(),
      dateEndCliff: (await ins.dateEndCliff()).toString(),
      claimFeesPerThousandForPT: (
        await ins.claimFeesPerThousandForPT()
      ).toString(),
      valueProjectTokenToFullRecharge: new Map(),
    };
  }

  async saveOrUpdate(data: IInterfaceProjectToken) {
    let result;
    if (!(await InterfaceProjectTokenModel.exists({ address: data.address }))) {
      result = await this.toModel(data).save();
    } else {
      result = await InterfaceProjectTokenModel.updateOne(
        { address: data.address },
        data
      );
    }
    this.lastUpdateBlock = this.actualBlock;
    this.lastState = result.toJSON();
    return result;
  }

  toModel(data: IInterfaceProjectToken) {
    return (InterfaceProjectTokenModel as any).toModel(data);
  }
}
