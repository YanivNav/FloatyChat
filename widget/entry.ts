import React from 'react';
import ReactDOM from 'react-dom/client';
import ChatWidget from './chat-widget';
import {wixClient} from './wix-client';

const container = document.createElement('div');
container.id = 'floaty-chat-root';
document.body.appendChild(container);
ReactDOM.createRoot(container).render(React.createElement(ChatWidget));

export const injectAccessTokenFunction = wixClient.auth.getAccessTokenInjector();