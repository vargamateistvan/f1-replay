import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { DialogHeader } from "./index";

const meta = {
  title: "UI/Dialog header",
  component: DialogHeader,
  args: { eyebrow: "Preferences", title: "Settings", closeLabel: "Close settings", onClose: fn() },
  decorators: [(Story) => <div className="max-w-xl border border-panel bg-surface"><Story /></div>],
} satisfies Meta<typeof DialogHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithMetadata: Story = { args: { meta: "F1 Replay", subtitle: "Make the pit wall your own" } };
