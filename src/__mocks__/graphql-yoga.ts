export { Repeater } from "graphql-yoga";

function createPubSubMock() {
  const pubSubMock = jest.fn().mockImplementation(() => pubSubMock);

  (pubSubMock as any).publish = jest.fn();
  (pubSubMock as any).subscribe = jest.fn();

  return pubSubMock;
}

export const createPubSub = jest.fn(() => createPubSubMock());
