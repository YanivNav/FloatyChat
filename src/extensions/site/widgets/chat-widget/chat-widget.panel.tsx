import React, { type FC, useState, useEffect, useCallback } from 'react';
import { widget, modals } from '@wix/editor';
import {
  SidePanel,
  WixDesignSystemProvider,
  Box,
  Text,
  ToggleSwitch,
  FormField,
  Button,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { ColorPickerField } from './components/ColorPickerField';

const DEFAULT_PRIMARY_COLOR = '#116DFF';

const Panel: FC = () => {
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_PRIMARY_COLOR);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);

  useEffect(() => {
    widget.getProp('primary-color')
      .then((val) => setPrimaryColor(val || DEFAULT_PRIMARY_COLOR))
      .catch(() => {});
    widget.getProp('preview-open')
      .then((val) => setPreviewOpen(val === 'true'))
      .catch(() => {});
  }, []);

  const handlePrimaryColorChange = useCallback((val: string): void => {
    setPrimaryColor(val);
    widget.setProp('primary-color', val);
  }, []);

  const handlePreviewOpenChange = useCallback((checked: boolean): void => {
    setPreviewOpen(checked);
    widget.setProp('preview-open', checked ? 'true' : 'false');
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
            <FormField label="Preview Chat Open">
              <Box direction="horizontal" verticalAlign="middle" gap="SP2">
                <ToggleSwitch checked={previewOpen} onChange={(e) => handlePreviewOpenChange(e.target.checked)} />
                <Text size="small" secondary>{previewOpen ? 'Showing open' : 'Showing closed'}</Text>
              </Box>
            </FormField>
            <Box direction="vertical" gap="SP2">
              <Text size="small" secondary>
                To change the bot name, greeting message or other settings for the AI assistant, open the bot settings page.
              </Text>
              <Button size="small" onClick={() => modals.openDashboardModal({ url: '/dashboard/49b24298-1e42-4cfb-90ed-92ddfafad33a' })}>
                Edit Settings
              </Button>
            </Box>
          </Box>
        </SidePanel.Content>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;
