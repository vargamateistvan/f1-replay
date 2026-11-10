import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { GapChart } from "./GapChart";
import { SAMPLE_CHART_TIME_MS, SAMPLE_DRIVERS, SAMPLE_INTERVALS, SAMPLE_LAP_MS, SAMPLE_LAP_STARTS, SAMPLE_START_MS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Charts/Gap to leader",
  component: GapChart,
  args: {
    drivers: SAMPLE_DRIVERS, intervals: SAMPLE_INTERVALS, lapStarts: SAMPLE_LAP_STARTS,
    sessionStartMs: SAMPLE_START_MS, sessionTimeMs: SAMPLE_CHART_TIME_MS,
    currentLap: 9, onSelectDriver: fn(),
  },
  decorators: [(Story) => <div className="flex h-[28rem] min-w-0 flex-col border border-panel"><Story /></div>],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <GapChart {...args} onSelectDriver={(focusDriver) => {
      args.onSelectDriver?.(focusDriver);
      updateArgs({ focusDriver });
    }} />;
  },
} satisfies Meta<typeof GapChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LapAxis: Story = {};
export const ElapsedTimeAxis: Story = { args: { lapStarts: [] } };
export const Focused: Story = { args: { focusDriver: 9 } };
export const RetiredDriver: Story = {
  args: {
    retiredDrivers: new Set([10]),
    intervals: SAMPLE_INTERVALS.filter((row) => row.driver_number !== 10 || Date.parse(row.date) <= SAMPLE_START_MS + SAMPLE_LAP_MS * 5),
  },
};
export const Empty: Story = { args: { intervals: [] } };
