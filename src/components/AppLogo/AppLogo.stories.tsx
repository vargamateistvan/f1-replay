import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppLogo } from "./AppLogo";

const meta = {
  title: "Brand/App logo",
  component: AppLogo,
  args: { size: 32 },
  decorators: [
    (Story) => <div className="inline-flex items-center gap-3 bg-f1red p-4 text-white">
      <Story />
      <span className="font-black uppercase tracking-caps">F1 Replay</span>
    </div>,
  ],
} satisfies Meta<typeof AppLogo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Compact: Story = { args: { size: 24 } };
export const Large: Story = { args: { size: 64 } };
