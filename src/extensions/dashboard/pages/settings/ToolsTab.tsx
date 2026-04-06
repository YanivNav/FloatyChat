import React, { type FC, useState, useEffect, useCallback } from 'react';
import { Box, Card, Divider, FormField, Input, Loader, Text, ToggleSwitch } from '@wix/design-system';
import { items } from '@wix/data';
import { dashboard } from '@wix/dashboard';
import { httpClient } from '@wix/essentials';
import { CHAT_SETTINGS_COLLECTION_ID } from '../../../../shared/collection-utils';
import type { BotSettings, ToolConfig, ToolSettingsMap } from '../../../../shared/types';
import { parseToolSettings } from '../../../../shared/types';

interface ToolMetadata {
  name: string;
  displayName: string;
  shortDescription: string;
  category: string;
  instructionHint?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  store: 'Store & Cart',
  orders: 'Orders',
  navigation: 'Navigation',
  utility: 'Utility',
};

const CATEGORY_ORDER = ['store', 'orders', 'navigation', 'utility'];

const DEFAULT_CONFIG: ToolConfig = { enabled: true, instruction: '' };

interface Props {
  onDirtyChange: (isDirty: boolean) => void;
  onSaveReady: (fn: () => Promise<void>) => void;
}

const ToolsTab: FC<Props> = ({ onDirtyChange, onSaveReady }) => {
  const [record, setRecord] = useState<BotSettings | null>(null);
  const [toolMap, setToolMap] = useState<ToolSettingsMap>({});
  const [allTools, setAllTools] = useState<ToolMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const origin = new URL(import.meta.url).origin;

    Promise.all([
      httpClient.fetchWithAuth(`${origin}/api/tools`).then((r) => r.json() as Promise<ToolMetadata[]>),
      items.query(CHAT_SETTINGS_COLLECTION_ID).find().then(({ items: results }) => results[0] as BotSettings | undefined),
    ])
      .then(([tools, item]) => {
        setAllTools(tools);
        if (item) {
          setRecord(item);
          setToolMap(parseToolSettings(item.toolSettings));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getConfig = (name: string): ToolConfig => toolMap[name] ?? DEFAULT_CONFIG;

  const setEnabled = (name: string, enabled: boolean) => {
    setToolMap((prev) => ({ ...prev, [name]: { ...getConfig(name), enabled } }));
    onDirtyChange(true);
  };

  const setInstruction = (name: string, instruction: string) => {
    setToolMap((prev) => ({ ...prev, [name]: { ...getConfig(name), instruction } }));
    onDirtyChange(true);
  };

  const handleSave = useCallback(async () => {
    try {
      const serialized = JSON.stringify(toolMap);
      if (record?._id) {
        await items.update(CHAT_SETTINGS_COLLECTION_ID, { ...record, toolSettings: serialized });
      } else {
        const inserted = await items.insert(CHAT_SETTINGS_COLLECTION_ID, { toolSettings: serialized });
        setRecord(inserted as BotSettings);
      }
      await httpClient.fetchWithAuth(`${new URL(import.meta.url).origin}/api/settings`, { method: 'DELETE' });
      onDirtyChange(false);
      dashboard.showToast({ message: 'Tool settings saved.', type: 'success', timeout: 'normal' });
    } catch (err) {
      dashboard.showToast({ message: 'Failed to save. Please try again.', type: 'error', timeout: 'none' });
      throw err;
    }
  }, [toolMap, record, onDirtyChange]);

  useEffect(() => {
    onSaveReady(handleSave);
  }, [handleSave, onSaveReady]);

  if (loading) {
    return (
      <Box align="center" paddingTop="SP10">
        <Loader size="medium" />
      </Box>
    );
  }

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    tools: allTools.filter((t) => t.category === cat),
  })).filter(({ tools }) => tools.length > 0);

  return (
    <Box direction="vertical" gap="SP4">
      {byCategory.map(({ cat, tools }) => (
        <Card key={cat}>
          <Card.Header title={CATEGORY_LABELS[cat] ?? cat} />
          <Card.Content>
            <Box direction="vertical">
              {tools.map((tool, idx) => {
                const config = getConfig(tool.name);
                return (
                  <React.Fragment key={tool.name}>
                    {idx > 0 && <Divider />}
                    <Box paddingTop={idx > 0 ? "SP4" : undefined} paddingBottom="SP4" direction="vertical" gap="SP3">
                      <Box direction="horizontal" verticalAlign="middle" gap="SP3">
                        <ToggleSwitch
                          checked={config.enabled}
                          onChange={() => setEnabled(tool.name, !config.enabled)}
                        />
                        <Box direction="vertical" gap="SP1">
                          <Box direction="horizontal" gap="SP2" verticalAlign="middle">
                            <Text weight="bold">{tool.displayName}</Text>
                            <Text secondary size="small">{tool.name}</Text>
                          </Box>
                          <Text secondary size="small">{tool.shortDescription}</Text>
                        </Box>
                      </Box>
                      {config.enabled && (
                        <FormField
                          label="Custom instruction (optional)"
                          infoContent="Appended to the tool's instructions when sent to the AI."
                        >
                          <Input
                            value={config.instruction}
                            onChange={(e) => setInstruction(tool.name, e.target.value)}
                            placeholder={tool.instructionHint ?? 'Add a custom instruction for this tool'}
                          />
                        </FormField>
                      )}
                    </Box>
                  </React.Fragment>
                );
              })}
            </Box>
          </Card.Content>
        </Card>
      ))}
    </Box>
  );
};

export default ToolsTab;
