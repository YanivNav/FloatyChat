import React, { type FC, useState } from 'react';
import { Page, Tabs, WixDesignSystemProvider } from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import BotSettingsTab from './BotSettingsTab';
import FaqTab from './FaqTab';

const DashboardPage: FC = () => {
  const [activeTab, setActiveTab] = useState('settings');

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header title="Floaty Chat Settings" />
        <Page.Content>
          <Tabs
            activeId={activeTab}
            onClick={({ id }) => setActiveTab(String(id))}
            items={[
              { id: 'settings', title: 'Bot Settings' },
              { id: 'faq', title: 'FAQ Knowledge Base' },
            ]}
          />
          {activeTab === 'settings' && <BotSettingsTab />}
          {activeTab === 'faq' && <FaqTab />}
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
