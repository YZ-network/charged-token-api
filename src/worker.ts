import { ethers } from "ethers";
import mongoose from "mongoose";
import { ChargedToken } from "./loaders";
import { Directory } from "./loaders/Directory";
import { IChargedToken, IDirectory } from "./models";

export async function worker(provider: ethers.providers.JsonRpcProvider) {
  await mongoose.connect("mongodb://localhost:27017/test");

  const directory = new Directory(provider, process.env.DIRECTORY_ADDRESS!);
  const dirData: IDirectory = await directory.load();

  console.log("Read directory", dirData.address, "data :");
  console.log(JSON.stringify(dirData, null, 2));

  console.log("saving it to db");
  await directory.saveOrUpdate(dirData);

  const ctList: IChargedToken[] = await Promise.all(
    Object.values(directory.ct).map(async (ct: ChargedToken) => {
      const ctData = await ct.load();
      await ct.saveOrUpdate(ctData);
      return ctData;
    })
  );
  console.log("loaded CT contracts :", JSON.stringify(ctList, null, 2));

  await mongoose.disconnect();
}
