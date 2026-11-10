import type { Meta, StoryObj } from "@storybook/react-vite";
import { TooltipCard } from "./index";

const meta = {
  title: "UI/Tooltip card",
  component: TooltipCard,
  args: {
    title: "Pit window",
    text: "Projected rejoin position based on the current gaps.",
    className: "relative block max-w-xs",
  },
} satisfies Meta<typeof TooltipCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SemanticAccent: Story = { args: { accentClassName: "bg-purple" } };
