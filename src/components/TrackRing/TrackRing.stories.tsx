import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { TrackRing } from "./TrackRing";
import { TrackPreview } from "../../../.storybook/TrackPreview";
import {
  RAIN_WEATHER,
  loadTrackGeometry,
  SAFETY_CAR_FLAGS,
  TRACK_ARGS,
  TRACK_DURATION_MS,
  TRACK_GAPS,
  TRACK_INTERVALS,
  TRACK_POSITIONS,
  YELLOW_FLAGS,
} from "../../../.storybook/trackFixtures";

const meta = {
  title: "Tracks/Ring",
  component: TrackRing,
  args: {
    ...TRACK_ARGS,
    lapLabel: "12/52",
    intervalRows: TRACK_INTERVALS,
    positionByDriver: TRACK_POSITIONS,
    onSelectDriver: fn(),
  },
  loaders: [loadTrackGeometry],
  decorators: [(Story) => <TrackPreview><Story /></TrackPreview>],
  argTypes: {
    previewTimeMs: { control: { type: "range", min: 0, max: TRACK_DURATION_MS, step: 500 } },
    locationData: { control: false },
    activeCompounds: { control: false },
    intervalRows: { control: false },
    positionByDriver: { control: false },
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <TrackRing {...args} onSelectDriver={(focusDriver) => {
      args.onSelectDriver?.(focusDriver);
      updateArgs({ focusDriver });
    }} />;
  },
  parameters: {
    docs: { description: { component: "Real ring view with synthetic positions, gaps and compounds. The lap counter is an illustrative label, not a race result. Use the playhead control, gap mode, flip, legend and quick settings to explore the dial." } },
  },
} satisfies Meta<typeof TrackRing>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Field: Story = {};
export const FocusedDriver: Story = { args: { focusDriver: 8 } };
export const PitWindow: Story = {
  args: { focusDriver: 7, pitRejoinGaps: TRACK_GAPS },
};
export const SectorYellow: Story = { args: { trackFlagState: YELLOW_FLAGS } };
export const SafetyCar: Story = { args: { trackFlagState: SAFETY_CAR_FLAGS } };
export const Rain: Story = { args: { weather: RAIN_WEATHER, weatherOverlay: RAIN_WEATHER } };
export const RetiredDriver: Story = { args: { retiredDrivers: new Set([12]) } };
