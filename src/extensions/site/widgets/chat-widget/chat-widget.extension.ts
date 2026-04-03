import { extensions } from '@wix/astro/builders';

export default extensions.customElement({
  id: '3500bf2f-3e87-4336-b56f-5a8b24d5e913',
  name: 'Chat Widget',
  width: {
    defaultWidth: 56,
    allowStretch: false
  },
  height: {
    defaultHeight: 56,
    heightMode: 'FIXED'
  },
  installation: {
    autoAdd: false
  },
  presets: [
    {
      id: 'd0f1be3b-15cc-4248-958b-a26afd592128',
      name: 'Default',
      thumbnailUrl: '{{BASE_URL}}/chat-widget-thumbnail.png',
    },
  ],
  
  tagName: 'chat-widget',
  element: './extensions/site/widgets/chat-widget/chat-widget.tsx',
  settings: './extensions/site/widgets/chat-widget/chat-widget.panel.tsx',
});
