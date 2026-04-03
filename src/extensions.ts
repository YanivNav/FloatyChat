import { app } from '@wix/astro/builders';
import myPage from './extensions/dashboard/pages/my-page/my-page.extension.ts';

import chatWidget from './extensions/site/widgets/chat-widget/chat-widget.extension.ts';

export default app()
  .use(myPage)
  .use(chatWidget);
