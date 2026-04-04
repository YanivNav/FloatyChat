import { extensions } from '@wix/astro/builders';

export const dataExtension = extensions.genericExtension({
  compId: 'ff950d24-e3c8-412a-bdd2-7bc9c81b7297',
  compName: 'data-extension',
  compType: 'DATA_COMPONENT',
  compData: {
    dataComponent: {
      collections: [
        {
          schemaUrl: 'https://www.wix.com/',
          idSuffix: 'chat-settings',
          displayName: 'Chat Settings',
          displayField: 'botName',
          fields: [
            { key: 'botName', displayName: 'Bot Name', type: 'TEXT' },
            { key: 'greetingMessage', displayName: 'Greeting Message', type: 'TEXT' },
          ],
          dataPermissions: {
            itemRead: 'CMS_EDITOR',
            itemInsert: 'CMS_EDITOR',
            itemUpdate: 'CMS_EDITOR',
            itemRemove: 'PRIVILEGED',
          },
          initialData: [
            { botName: 'AI Assistant', greetingMessage: 'Hi! How can I help you today?' },
          ],
        },
      ],
    },
  },
});
