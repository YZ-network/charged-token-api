export const EventListener = jest.fn().mockImplementation(() => {
  return {
    destroy: jest.fn(),
  };
});
