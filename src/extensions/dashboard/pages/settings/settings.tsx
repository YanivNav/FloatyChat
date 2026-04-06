import React, { type FC, useState, useRef, useCallback } from 'react';
import { Button, Page, Tabs, WixDesignSystemProvider } from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import BotSettingsTab from './BotSettingsTab';
import FaqTab from './FaqTab';
import ToolsTab from './ToolsTab';

const DashboardPage: FC = () => {
  const [activeTab, setActiveTab] = useState('settings');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setIsDirty(false);
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveRef.current();
    } finally {
      setSaving(false);
    }
  }, []);

  const onSaveReady = (fn: () => Promise<void>) => { saveRef.current = fn; };

  return (
    <WixDesignSystemProvider>
      <Page height="calc(100vh - 48px)">
        <Page.Header
          title="Floaty Chat Settings"
          actionsBar={
            activeTab === 'tools' && isDirty ? (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            ) : undefined
          }
        />
        <Page.Content>
          <Tabs
            activeId={activeTab}
            onClick={({ id }) => handleTabChange(String(id))}
            items={[
              { id: 'settings', title: 'Bot Settings' },
              { id: 'faq', title: 'FAQ Knowledge Base' },
              { id: 'tools', title: 'Tools' },
            ]}
          />
          {activeTab === 'settings' && <BotSettingsTab />}
          {activeTab === 'faq' && <FaqTab />}
          {activeTab === 'tools' && (
            <ToolsTab onDirtyChange={setIsDirty} onSaveReady={onSaveReady} />
          )}
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
