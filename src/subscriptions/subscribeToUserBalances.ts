import { pubSub } from "../graphql";
import { Directory } from "../loaders";

export async function subscribeToUserBalancesLoading(
  directory: Directory
): Promise<void> {
  const sub = pubSub.subscribe(`UserBalance.${directory.chainId}/load`);

  for await (const user of sub) {
    console.log("triggered reloading user balances", user);
    await directory.loadAllUserBalances(user);
  }
}

export default subscribeToUserBalancesLoading;
