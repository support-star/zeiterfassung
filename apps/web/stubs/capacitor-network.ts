export const Network = {
  async addListener() { return { remove: () => {} }; },
  async getStatus() { return { connected: true, connectionType: 'wifi' }; },
};
