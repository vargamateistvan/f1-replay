import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { Segmented } from "./index";
import { SPEEDS } from "@/constants";

const meta = {
  title: "UI/Segmented",
  component: Segmented,
  args: {
    options: [{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }],
    value: "metric",
    onChange: fn(),
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <Segmented {...args} onChange={(value) => {
      args.onChange(value);
      updateArgs({ value });
    }} />;
  },
} satisfies Meta<typeof Segmented>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Units: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const PlaybackSpeed: Story = {
  args: { value: 1, options: SPEEDS.map((value) => ({ value, label: `${value}x` })) },
};
