import React, { type FC, useState, useEffect, useCallback } from 'react';
import { Box, Button, Card, FormField, Input, Loader, Text } from '@wix/design-system';
import { items } from '@wix/data';
import { DEFAULT_CHAT_SETTINGS } from '../../../../shared/chat-settings';
import { CHAT_SETTINGS_COLLECTION_ID } from '../../../../shared/collection-utils';
import type { BotSettings } from '../../../../shared/types';

const BotSettingsTab: FC = () => {
  const [settings, setSettings] = useState<BotSettings>({ botName: DEFAULT_CHAT_SETTINGS.botName, greetingMessage: DEFAULT_CHAT_SETTINGS.greetingMessage });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    items.query(CHAT_SETTINGS_COLLECTION_ID)
      .find()
      .then(({ items: results }) => {
        const item = results[0] as BotSettings | undefined;
        if (item) setSettings(item);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      if (settings._id) {
        await items.update(CHAT_SETTINGS_COLLECTION_ID, settings);
      } else {
        const inserted = await items.insert(CHAT_SETTINGS_COLLECTION_ID, settings);
        setSettings((prev) => ({ ...prev, _id: inserted._id }));
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
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
          <FormField label="Bot Display Name">
            <Input
              value={settings.botName}
              onChange={(e) => setSettings((prev) => ({ ...prev, botName: e.target.value }))}
              placeholder={DEFAULT_CHAT_SETTINGS.botName}
            />
          </FormField>
          <FormField label="Greeting Message" infoContent="The first message visitors see when they open the chat.">
            <Input
              value={settings.greetingMessage}
              onChange={(e) => setSettings((prev) => ({ ...prev, greetingMessage: e.target.value }))}
              placeholder={DEFAULT_CHAT_SETTINGS.greetingMessage}
            />
          </FormField>
          <Box direction="horizontal" gap="SP3" verticalAlign="middle">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {saveStatus === 'saved' && <Text size="small" skin="success">Settings saved.</Text>}
            {saveStatus === 'error' && <Text size="small" skin="error">Failed to save. Please try again.</Text>}
          </Box>
        </Box>
      </Card.Content>
    </Card>
  );
};

export default BotSettingsTab;
