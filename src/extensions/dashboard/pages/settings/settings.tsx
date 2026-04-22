import React, { type FC, useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Loader,
  Page,
  Tabs,
  WixDesignSystemProvider,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { items } from '@wix/data';
import { CHAT_SETTINGS_COLLECTION_ID } from '../../../../shared/collection-utils';
import type { BotSettings } from '../../../../shared/types';
import OnboardingSection from './OnboardingSection';
import BotSettingsTab from './BotSettingsTab';
import FaqTab from './FaqTab';
import ToolsTab from './ToolsTab';

const DashboardPage: FC = () => {
  const [activeTab, setActiveTab] = useState('settings');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    items.query(CHAT_SETTINGS_COLLECTION_ID)
      .find()
      .then(({ items: results }) => {
        const item = results[0] as BotSettings | undefined;
        setIsInstalled(item?.isInstalled === true);
      })
      .catch(() => {
        setIsInstalled(false);
      });
  }, []);

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

  const actionsBar = isInstalled && activeTab === 'tools' && isDirty ? (
    <Button onClick={handleSave} disabled={saving}>
      {saving ? 'Saving…' : 'Save Changes'}
    </Button>
  ) : undefined;

  return (
    <WixDesignSystemProvider>
      <Page height="calc(100vh - 48px)">
        <Page.Header title="Floaty Chat Settings" actionsBar={actionsBar} />
        <Page.Content>
          {isInstalled === null && (
            <Box align="center" paddingTop="SP10">
              <Loader size="medium" />
            </Box>
          )}
          {isInstalled === false && (
            <OnboardingSection onInstalled={() => setIsInstalled(true)} />
          )}
          {isInstalled === true && (
            <>
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
            </>
          )}
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
