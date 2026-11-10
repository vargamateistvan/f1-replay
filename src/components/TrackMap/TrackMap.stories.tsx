import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, within } from "storybook/test";
import { TrackMap } from "./TrackMap";
import { TrackPreview } from "../../../.storybook/TrackPreview";
import {
  MONACO_LOCATIONS,
  loadTrackGeometry,
  RAIN_WEATHER,
  SAFETY_CAR_FLAGS,
  TRACK_ARGS,
  TRACK_DRIVERS,
  TRACK_DURATION_MS,
  YELLOW_FLAGS,
} from "../../../.storybook/trackFixtures";

const meta = {
  title: "Tracks/2D",
  component: TrackMap,
  args: { ...TRACK_ARGS, showStartReplayHint: false, onSelectDriver: fn() },
  loaders: [loadTrackGeometry],
  decorators: [(Story) => <TrackPreview><Story /></TrackPreview>],
  argTypes: {
    previewTimeMs: { control: { type: "range", min: 0, max: TRACK_DURATION_MS, step: 500 } },
    locationData: { control: false },
    activeCompounds: { control: false },
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <TrackMap {...args} onSelectDriver={(focusDriver) => {
      args.onSelectDriver?.(focusDriver);
      updateArgs({ focusDriver });
    }} />;
  },
  parameters: {
    docs: { description: { component: "Real 2D track component with synthetic GPS samples. Telemetry requests and start-light sounds are disabled. Pan, zoom, rotate and focus controls remain interactive." } },
  },
} satisfies Meta<typeof TrackMap>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Silverstone: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
    await expect(canvas.getByRole("button", { name: "Zoom out" })).toBeEnabled();
  },
};
export const Monaco: Story = {
  args: { circuitKey: 22, circuitShortName: "Monte Carlo", locationData: MONACO_LOCATIONS },
};
export const FocusedBattle: Story = {
  args: { focusDriver: TRACK_DRIVERS[1]!.driver_number, battlingDrivers: new Set([7, 8]) },
};
export const SectorYellow: Story = { args: { trackFlagState: YELLOW_FLAGS } };
export const SafetyCar: Story = { args: { trackFlagState: SAFETY_CAR_FLAGS } };
export const Rain: Story = { args: { weather: RAIN_WEATHER, weatherOverlay: RAIN_WEATHER } };
export const PitExitClosed: Story = {
  args: { pitLaneStatus: { lane: "open", entry: "open", exit: "closed" } },
};
export const WithoutCars: Story = { args: { locationData: [] } };
