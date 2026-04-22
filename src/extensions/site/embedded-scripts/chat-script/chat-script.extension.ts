import { extensions } from '@wix/astro/builders';

export default extensions.embeddedScript({
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'floaty-chat-script',
  placement: 'BODY_END',
  scriptType: 'ESSENTIAL',
  source: './extensions/site/embedded-scripts/chat-script/chat-script.html',
});
