export const BarcodeScanner = {
  async requestPermissions() { return { camera: 'denied' }; },
  async scan() { return { barcodes: [] }; },
  async isSupported() { return { supported: false }; },
};
