import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { StrategyBar } from "./StrategyBar";
import { SAMPLE_CHART_TIME_MS, SAMPLE_DRIVERS, SAMPLE_LAPS, SAMPLE_PITS, SAMPLE_START_MS, SAMPLE_STINTS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Racing/Strategy",
  component: StrategyBar,
  args: {
    drivers: SAMPLE_DRIVERS, laps: SAMPLE_LAPS, pits: SAMPLE_PITS, stints: SAMPLE_STINTS,
    sessionStartMs: SAMPLE_START_MS, sessionTimeMs: SAMPLE_CHART_TIME_MS,
    currentLap: 9, onSelectDriver: fn(),
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <StrategyBar {...args} onSelectDriver={(driverNumber) => {
      args.onSelectDriver?.(driverNumber);
      updateArgs({ focusDriver: args.focusDriver === driverNumber ? null : driverNumber });
    }} />;
  },
  parameters: { docs: { description: { component: "Synthetic two-stint strategies with pit stops. Rows focus drivers; Elapsed/All reveals the rest of the sample race." } } },
} satisfies Meta<typeof StrategyBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoStints: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Focus APE" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Unfocus APE" })).toBeVisible());
  },
};
export const FocusedDriver: Story = { args: { focusDriver: 8 } };
export const BeforeFirstStop: Story = { args: { currentLap: 4, sessionTimeMs: 270000 } };
export const WetCompounds: Story = {
  args: { stints: SAMPLE_STINTS.map((stint) => ({
    ...stint, compound: stint.stint_number === 1 ? "INTERMEDIATE" : "WET",
  })) },
};
export const Empty: Story = { args: { stints: [] } };
