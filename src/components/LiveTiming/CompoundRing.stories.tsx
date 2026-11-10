import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Stint } from "@/api/types";
import { CompoundRing } from "./TyreBadge";

const compounds = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"] as const satisfies readonly Stint["compound"][];
const meta = {
  title: "Racing/Compound ring",
  component: CompoundRing,
  args: { compound: "SOFT", size: "md" },
  argTypes: {
    compound: { control: "select", options: compounds },
    size: { control: "select", options: ["sm", "md"] },
  },
} satisfies Meta<typeof CompoundRing>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Soft: Story = {};
export const Hard: Story = { args: { compound: "HARD" } };
export const Small: Story = { args: { size: "sm" } };
export const AllCompounds: Story = {
  render: (args) => <div className="flex flex-wrap gap-4">
    {compounds.map((compound) => <div key={compound} className="flex flex-col items-center gap-2">
      <CompoundRing {...args} compound={compound} />
      <span className="font-mono text-caption text-muted">{compound}</span>
    </div>)}
  </div>,
};
