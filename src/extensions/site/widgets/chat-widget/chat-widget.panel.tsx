import React, { type FC, useState, useEffect, useCallback } from 'react';
import { widget } from '@wix/editor';
import {
  SidePanel,
  WixDesignSystemProvider,
  Input,
  FormField,
  Box,
  Text,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { ColorPickerField } from './components/ColorPickerField';

const DEFAULT_BOT_NAME = 'AI Assistant';
const DEFAULT_PRIMARY_COLOR = '#116DFF';
const DEFAULT_GREETING = 'Hi! How can I help you today?';

const Panel: FC = () => {
  const [botName, setBotName] = useState<string>(DEFAULT_BOT_NAME);
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_PRIMARY_COLOR);
  const [greetingMessage, setGreetingMessage] = useState<string>(DEFAULT_GREETING);

  useEffect(() => {
    Promise.all([
      widget.getProp('bot-name'),
      widget.getProp('primary-color'),
      widget.getProp('greeting-message'),
    ])
      .then(([nameVal, colorVal, greetingVal]) => {
        setBotName(nameVal || DEFAULT_BOT_NAME);
        setPrimaryColor(colorVal || DEFAULT_PRIMARY_COLOR);
        setGreetingMessage(greetingVal || DEFAULT_GREETING);
      })
      .catch((error: unknown) => console.error('Failed to fetch widget properties:', error));
  }, []);

  const handleBotNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const val = e.target.value;
      setBotName(val);
      widget.setProp('bot-name', val);
    },
    [],
  );

  const handlePrimaryColorChange = useCallback((val: string): void => {
    setPrimaryColor(val);
    widget.setProp('primary-color', val);
  }, []);

  const handleGreetingChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const val = e.target.value;
      setGreetingMessage(val);
      widget.setProp('greeting-message', val);
    },
    [],
  );

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Header title="Chat Assistant Settings" />
        <SidePanel.Content noPadding stretchVertically>
          <Box direction="vertical" gap="SP4" padding="SP4">
            <SidePanel.Field>
              <FormField label="Bot Display Name">
                <Input
                  value={botName}
                  onChange={handleBotNameChange}
                  placeholder="e.g. AI Assistant"
                />
              </FormField>
            </SidePanel.Field>

            <SidePanel.Field>
              <FormField label="Greeting Message">
                <Input
                  value={greetingMessage}
                  onChange={handleGreetingChange}
                  placeholder="e.g. Hi! How can I help you today?"
                />
              </FormField>
            </SidePanel.Field>

            <ColorPickerField
              label="Primary Color"
              value={primaryColor}
              onChange={handlePrimaryColorChange}
            />

            <Box>
              <Text size="small" secondary>
                The primary color is used for the chat button, header, and user message bubbles.
              </Text>
            </Box>
          </Box>
        </SidePanel.Content>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;
