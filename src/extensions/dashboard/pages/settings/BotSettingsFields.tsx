import React, { type FC } from 'react';
import { Box, ColorInput, FormField, Input, SegmentedToggle } from '@wix/design-system';
import { DEFAULT_CHAT_SETTINGS } from '../../../../shared/chat-settings';
import type { BotSettings } from '../../../../shared/types';

type BotSettingsFieldsProps = {
  settings: Pick<BotSettings, 'botName' | 'greetingMessage' | 'primaryColor' | 'position'>;
  onChange: (field: keyof BotSettings, value: string) => void;
};

const BotSettingsFields: FC<BotSettingsFieldsProps> = ({ settings, onChange }) => (
  <Box direction="vertical" gap="SP6">
    <FormField label="Bot Display Name">
      <Input
        value={settings.botName}
        onChange={(e) => onChange('botName', e.target.value)}
        placeholder={DEFAULT_CHAT_SETTINGS.botName}
      />
    </FormField>
    <FormField label="Greeting Message" infoContent="The first message visitors see when they open the chat.">
      <Input
        value={settings.greetingMessage}
        onChange={(e) => onChange('greetingMessage', e.target.value)}
        placeholder={DEFAULT_CHAT_SETTINGS.greetingMessage}
      />
    </FormField>
    <FormField label="Primary Color">
      <ColorInput
        value={settings.primaryColor ?? DEFAULT_CHAT_SETTINGS.primaryColor!}
        onChange={(value) => onChange('primaryColor', typeof value === 'string' ? value : String(value))}
      />
    </FormField>
    <FormField label="Widget Position">
      <SegmentedToggle
        selected={settings.position ?? DEFAULT_CHAT_SETTINGS.position}
        onClick={(_e, value) => onChange('position', value as string)}
      >
        <SegmentedToggle.Button value="bottom-right">Bottom Right</SegmentedToggle.Button>
        <SegmentedToggle.Button value="bottom-left">Bottom Left</SegmentedToggle.Button>
      </SegmentedToggle>
    </FormField>
  </Box>
);

export default BotSettingsFields;
