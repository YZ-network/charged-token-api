import { AbstractBlockchainRepository } from "./AbstractBlockchainRepository";
import { AbstractLoader } from "./AbstractLoader";
import { ChargedToken } from "./ChargedToken";
import { DelegableToLT } from "./DelegableToLT";
import { Directory } from "./Directory";
import { InterfaceProjectToken } from "./InterfaceProjectToken";
import { DataType } from "./types";

export const loaderFactory = function (
  dataType: DataType,
  chainId: number,
  address: string,
  blockchain: AbstractBlockchainRepository,
): AbstractLoader<any> {
  switch (dataType) {
    case DataType.Directory:
      return new Directory(chainId, blockchain, address, loaderFactory);
    case DataType.ChargedToken:
      return new ChargedToken(chainId, blockchain, address, loaderFactory);
    case DataType.InterfaceProjectToken:
      return new InterfaceProjectToken(chainId, blockchain, address, loaderFactory);
    case DataType.DelegableToLT:
      return new DelegableToLT(chainId, blockchain, address, loaderFactory);
    default:
      throw new Error("Unknown loader type !");
  }
};
