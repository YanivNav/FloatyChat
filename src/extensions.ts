import { app } from '@wix/astro/builders';
import { dataExtension } from './extensions/data/extensions.ts';
import myPage from './extensions/dashboard/pages/settings/settings.extension.ts';
import chatScript from './extensions/site/embedded-scripts/chat-script/chat-script.extension.ts';

export default app()
  .use(dataExtension)
  .use(myPage)
  .use(chatScript);
