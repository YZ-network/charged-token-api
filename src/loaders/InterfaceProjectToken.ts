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
    super(provider, address, contracts.InterfaceProjectToken);
  }

  async init() {
    const inData = await this.load();
    await this.saveOrUpdate(inData);

    if (inData.projectToken !== EMPTY_ADDRESS) {
      this.projectToken = new DelegableToLT(this.provider, inData.projectToken);
      await this.projectToken.init();
    }

    this.subscribeToEvents();
  }

  async load() {
    console.log("Reading interface project token @", this.address);

    const ins = this.instance;

    return {
      // ownable
      address: this.address,
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
    if (!(await InterfaceProjectTokenModel.exists({ address: data.address }))) {
      await this.toModel(data).save();
    } else {
      await InterfaceProjectTokenModel.updateOne(
        { address: data.address },
        data
      );
    }
  }

  subscribeToEvents(): void {
    /*
    event StartSet(uint _dateLaunch, uint _dateEndCliff);

  event ProjectTokenReceived(address _user, uint _value, uint _fees, uint _hodlRewards);

  event LTRecharged(address _user, uint _value, uint _valueProjectToken, uint _hodlRewards);
     */
  }

  toModel(data: IInterfaceProjectToken) {
    return (InterfaceProjectTokenModel as any).toModel(data);
  }
}
