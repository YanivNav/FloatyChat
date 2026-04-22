import React, { type FC, useState, useEffect, useCallback, useRef } from 'react';
import { Box, Button, Card, Loader } from '@wix/design-system';
import { items } from '@wix/data';
import { dashboard } from '@wix/dashboard';
import { httpClient } from '@wix/essentials';
import { DEFAULT_CHAT_SETTINGS } from '../../../../shared/chat-settings';
import { CHAT_SETTINGS_COLLECTION_ID } from '../../../../shared/collection-utils';
import type { BotSettings } from '../../../../shared/types';
import BotSettingsFields from './BotSettingsFields';

const BotSettingsTab: FC = () => {
  const [settings, setSettings] = useState<BotSettings>({
    botName: DEFAULT_CHAT_SETTINGS.botName,
    greetingMessage: DEFAULT_CHAT_SETTINGS.greetingMessage,
    primaryColor: DEFAULT_CHAT_SETTINGS.primaryColor,
    position: DEFAULT_CHAT_SETTINGS.position,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    items.query(CHAT_SETTINGS_COLLECTION_ID)
      .find()
      .then(({ items: results }) => {
        const item = results[0] as BotSettings | undefined;
        if (item) setSettings(item);
      })
      .catch(() => {})
      .finally(() => {
        hasLoadedRef.current = true;
        setLoading(false);
      });
  }, []);

  const handleChange = (field: keyof BotSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    if (hasLoadedRef.current) setIsDirty(true);
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (settings._id) {
        await items.update(CHAT_SETTINGS_COLLECTION_ID, settings);
      } else {
        const inserted = await items.insert(CHAT_SETTINGS_COLLECTION_ID, settings);
        setSettings((prev) => ({ ...prev, _id: inserted._id }));
      }
      await httpClient.fetchWithAuth(`${new URL(import.meta.url).origin}/api/settings`, { method: 'DELETE' });
      setIsDirty(false);
      dashboard.showToast({ message: 'Settings saved.', type: 'success', timeout: 'normal' });
    } catch {
      dashboard.showToast({ message: 'Failed to save. Please try again.', type: 'error', timeout: 'none' });
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <Box align="center" paddingTop="SP10">
        <Loader size="medium" />
      </Box>
    );
  }

  return (
    <Card>
      <Card.Header title="Bot Configuration" />
      <Card.Content>
        <Box direction="vertical" gap="SP6">
          <BotSettingsFields settings={settings} onChange={handleChange} />
          <Box>
            <Button onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Box>
        </Box>
      </Card.Content>
    </Card>
  );
};

export default BotSettingsTab;
