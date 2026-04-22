import React, { type FC, useState } from 'react';
import { Box, Button, Card, Heading, Text } from '@wix/design-system';
import { items } from '@wix/data';
import { dashboard } from '@wix/dashboard';
import { embeddedScripts } from '@wix/app-management';
import { DEFAULT_CHAT_SETTINGS } from '../../../../shared/chat-settings';
import { CHAT_SETTINGS_COLLECTION_ID } from '../../../../shared/collection-utils';
import type { BotSettings } from '../../../../shared/types';
import BotSettingsFields from './BotSettingsFields';

const OnboardingSection: FC<{ onInstalled: () => void }> = ({ onInstalled }) => {
  const [form, setForm] = useState<BotSettings>({
    botName: DEFAULT_CHAT_SETTINGS.botName,
    greetingMessage: DEFAULT_CHAT_SETTINGS.greetingMessage,
    primaryColor: DEFAULT_CHAT_SETTINGS.primaryColor,
    position: DEFAULT_CHAT_SETTINGS.position,
  });
  const [saving, setSaving] = useState(false);

  const handleSetup = async () => {
    setSaving(true);
    try {
      const existing = await items.query(CHAT_SETTINGS_COLLECTION_ID).find();
      const record: BotSettings = { ...form, isInstalled: true };
      if (existing.items[0]?._id) {
        await items.update(CHAT_SETTINGS_COLLECTION_ID, { ...record, _id: existing.items[0]._id });
      } else {
        await items.insert(CHAT_SETTINGS_COLLECTION_ID, record);
      }
      await embeddedScripts.embedScript({ parameters: {} });
      dashboard.showToast({ message: 'Your chat widget is now live on all pages.', type: 'success', timeout: 'normal' });
      onInstalled();
    } catch {
      dashboard.showToast({ message: 'Setup failed. Please try again.', type: 'error', timeout: 'none' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box direction="vertical" align="center" paddingTop="SP10">
      <Card>
        <Card.Content>
          <Box direction="vertical" gap="SP6" style={{ minWidth: 480 }}>
            <Box direction="vertical" gap="SP2">
              <Heading size="medium">Set Up Your Chat Widget</Heading>
              <Text secondary>Configure your widget and activate it on all pages of your site.</Text>
            </Box>
            <BotSettingsFields
              settings={form}
              onChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
            />
            <Box>
              <Button onClick={handleSetup} disabled={saving}>
                {saving ? 'Setting Up…' : 'Set Up Chat Widget'}
              </Button>
            </Box>
          </Box>
        </Card.Content>
      </Card>
    </Box>
  );
};

export default OnboardingSection;
