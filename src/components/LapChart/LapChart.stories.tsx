import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, within } from "storybook/test";
import { LapChart } from "./LapChart";
import { SAMPLE_CHART_TIME_MS, SAMPLE_DRIVERS, SAMPLE_LAP_STARTS, SAMPLE_POSITIONS, SAMPLE_START_MS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Charts/Lap positions",
  component: LapChart,
  args: {
    drivers: SAMPLE_DRIVERS, positions: SAMPLE_POSITIONS, lapStarts: SAMPLE_LAP_STARTS,
    sessionStartMs: SAMPLE_START_MS, sessionTimeMs: SAMPLE_CHART_TIME_MS,
    currentLap: 9, onSelectDriver: fn(),
  },
  decorators: [(Story) => <div className="flex h-[28rem] min-w-0 flex-col border border-panel"><Story /></div>],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <LapChart {...args} onSelectDriver={(focusDriver) => {
      args.onSelectDriver?.(focusDriver);
      updateArgs({ focusDriver });
    }} />;
  },
} satisfies Meta<typeof LapChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PositionChanges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Elapsed" }));
    await expect(canvas.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  },
};
export const Focused: Story = { args: { focusDriver: 8 } };
export const OpeningLap: Story = { args: { currentLap: 1, sessionTimeMs: 0 } };
export const Empty: Story = { args: { positions: [] } };
