// Vendor
import Service from '@ember/service';

// Utilities
import {extensionApi} from 'better-trading/utilities/extension-api';

export default class ExtensionBackground extends Service {
  // eslint-disable-next-line @typescript-eslint/require-await
  async fetchPoeNinjaResource(resource: string): Promise<object> {
    return new Promise((resolve, reject) => {
      extensionApi().runtime.sendMessage({query: 'poe-ninja', resource}, (payload: object | null) => {
        return payload ? resolve(payload) : reject(new Error('poe-ninja fetch failed'));
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async fetchPoeNinjaPoe2Resource(resource: string): Promise<object> {
    return new Promise((resolve, reject) => {
      extensionApi().runtime.sendMessage({query: 'poe-ninja-poe2', resource}, (payload: object | null) => {
        return payload ? resolve(payload) : reject(new Error('poe-ninja-poe2 fetch failed'));
      });
    });
  }
}

declare module '@ember/service' {
  interface Registry {
    'extension-background': ExtensionBackground;
  }
}
