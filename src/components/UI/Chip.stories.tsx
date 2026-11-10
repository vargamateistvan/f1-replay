import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { Chip } from "./index";
import { TOKEN_HEX } from "@/designTokens";

const meta = {
  title: "UI/Chip",
  component: Chip,
  args: { label: "Race control", active: true, onToggle: fn() },
  argTypes: {
    tone: { control: "select", options: ["yellow", "red", "green", "orange", "purple", "blue", "teal", "neutral"] },
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <Chip {...args} onToggle={() => {
      args.onToggle();
      updateArgs({ active: !args.active });
    }} />;
  },
} satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Inactive: Story = { args: { active: false } };
export const SemanticTone: Story = { args: { label: "Yellow flag", tone: "yellow" } };
export const CustomSwatch: Story = { args: { label: "Pit stops", color: TOKEN_HEX.blue } };
export const Disabled: Story = { args: { disabled: true } };
