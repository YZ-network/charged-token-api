const ClientSession = jest.fn().mockImplementation(() => {
  return {};
});

export default {
  startSession: jest.fn(),
  ClientSession,
};
