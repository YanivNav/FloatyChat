import { app } from '@wix/astro/builders';
import { dataExtension } from './extensions/data/extensions.ts';
import myPage from './extensions/dashboard/pages/settings/settings.extension.ts';
import chatWidget from './extensions/site/widgets/chat-widget/chat-widget.extension.ts';

export default app()
  .use(dataExtension)
  .use(myPage)
  .use(chatWidget);
