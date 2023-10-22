import { EventHandlerStatus } from "../../enums";
import { EventModel, type IEvent } from "../Event";

jest.unmock("mongoose");
jest.unmock("mongodb");

describe("EventModel", () => {
  function sampleData(): IEvent {
    return {
      status: EventHandlerStatus.QUEUED,
      chainId: 1337,
      address: "0xADDR",
      blockNumber: 50,
      blockDate: "150",
      txHash: "0xhash",
      txIndex: 5,
      logIndex: 6,
      name: "eventName",
      contract: "Contract",
      topics: ["0xa", "0xb"],
      args: ["0xarg1", "0xarg2"],
    };
  }

  test("should convert business object to mongo model", () => {
    const bo: IEvent = sampleData();

    const model = EventModel.toModel(bo);

    expect(model.toJSON()).toMatchObject(bo);
  });

  test("should convert mongo model to business object in graphql format", () => {
    const sample = sampleData();
    const model = new EventModel(sample);

    const bo = EventModel.toGraphQL(model);

    expect(bo._id).toBeDefined();
    expect(bo).toMatchObject(sample);
  });
});
