import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChartTooltipCard } from "./ChartTooltipCard";
import { TOKEN_HEX } from "@/designTokens";

const meta = {
  title: "Charts/Tooltip card",
  component: ChartTooltipCard,
  args: {
    title: "Lap 20",
    rows: [
      { key: "ape", label: "APE", color: TOKEN_HEX.blue, value: "Leader", emphasis: true },
      { key: "crv", label: "CRV", color: TOKEN_HEX.orange, value: "+1.234s" },
      { key: "rce", label: "RCE", color: TOKEN_HEX.green, value: "+3.891s" },
      { key: "pit", label: "PIT", color: TOKEN_HEX.purple, value: "+8.215s" },
    ],
  },
  decorators: [(Story) => <div className="inline-block"><Story /></div>],
} satisfies Meta<typeof ChartTooltipCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Field: Story = {};
export const SingleDriver: Story = { args: { rows: meta.args.rows.slice(0, 1) } };
export const OddRowCount: Story = { args: { rows: meta.args.rows.slice(0, 3) } };
