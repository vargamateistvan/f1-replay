import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { LapRangeToggle } from "./LapRangeToggle";

const meta = {
  title: "Charts/Lap range toggle",
  component: LapRangeToggle,
  args: { showAll: false, onToggle: fn() },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <LapRangeToggle {...args} onToggle={() => {
      args.onToggle();
      updateArgs({ showAll: !args.showAll });
    }} />;
  },
} satisfies Meta<typeof LapRangeToggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Elapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Elapsed" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true"));
  },
};
export const AllLaps: Story = { args: { showAll: true } };
