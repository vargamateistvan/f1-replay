import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { SettingRow } from "./index";

const meta = {
  title: "UI/Setting row",
  component: SettingRow,
  args: {
    label: "Weather effects",
    description: "Show rain on the track map",
    checked: true,
    onChange: fn(),
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <SettingRow {...args} onChange={(checked) => {
      args.onChange(checked);
      updateArgs({ checked });
    }} />;
  },
} satisfies Meta<typeof SettingRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const WithoutDescription: Story = { args: { description: undefined } };
