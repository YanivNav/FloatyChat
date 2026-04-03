import React, { type FC } from 'react';
import { inputs } from '@wix/editor';
import { FormField, Box, FillPreview, SidePanel } from '@wix/design-system';

interface ColorPickerFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export const ColorPickerField: FC<ColorPickerFieldProps> = ({ label, value, onChange }) => (
  <SidePanel.Field>
    <FormField label={label}>
      <Box width="30px" height="30px">
        <FillPreview
          fill={value}
          onClick={() =>
            inputs.selectColor(value, {
              onChange: (val) => {
                if (val) onChange(val);
              },
            })
          }
        />
      </Box>
    </FormField>
  </SidePanel.Field>
);
