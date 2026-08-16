import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'switch-tab',
    description: 'Switch tabs with a blurred visual switcher.',
    permissions: ['tabs', 'storage'],
    action: {
      default_title: 'switch-tab settings',
    },
    commands: {
      'next-tab': {
        suggested_key: {
          default: 'Ctrl+Q',
          mac: 'MacCtrl+Q',
        },
        description: 'Switch forward to the next tab',
      },
      'prev-tab': {
        suggested_key: {
          default: 'Ctrl+Shift+Q',
          mac: 'MacCtrl+Shift+Q',
        },
        description: 'Switch backward to the previous tab',
      },
    },
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
  },
});
