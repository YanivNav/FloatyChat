import React, { type FC, useState, useEffect, useCallback } from 'react';
import { widget } from '@wix/editor';
import {
  SidePanel,
  WixDesignSystemProvider,
  Box,
  Text,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { ColorPickerField } from './components/ColorPickerField';

const DEFAULT_PRIMARY_COLOR = '#116DFF';

const Panel: FC = () => {
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_PRIMARY_COLOR);

  useEffect(() => {
    widget.getProp('primary-color')
      .then((val) => setPrimaryColor(val || DEFAULT_PRIMARY_COLOR))
      .catch(() => {});
  }, []);

  const handlePrimaryColorChange = useCallback((val: string): void => {
    setPrimaryColor(val);
    widget.setProp('primary-color', val);
  }, []);

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Header title="Chat Widget Settings" />
        <SidePanel.Content noPadding stretchVertically>
          <Box direction="vertical" gap="SP4" padding="SP4">
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
            <Box>
              <Text size="small" secondary>
                To change the bot name and greeting message, visit the Floaty Chat Settings page in your dashboard.
              </Text>
            </Box>
          </Box>
        </SidePanel.Content>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;
