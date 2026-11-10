import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Weather } from "@/api/types";
import { WeatherPanel } from "./WeatherPanel";

const start = Date.parse("2026-01-01T12:00:00Z");
const reading: Weather = {
  date: "2026-01-01T12:00:00Z",
  session_key: 1,
  meeting_key: 1,
  air_temperature: 24,
  track_temperature: 38,
  humidity: 45,
  pressure: 1013,
  rainfall: 0,
  wind_direction: 225,
  wind_speed: 3.5,
};
const meta = {
  title: "Racing/Weather panel",
  component: WeatherPanel,
  args: { entries: [reading], sessionStartMs: start, sessionTimeMs: 120000, sessionKey: null },
  decorators: [(Story) => <div className="max-w-xl border border-panel"><Story /></div>],
  parameters: {
    docs: { description: { component: "Local weather samples. Use the units toolbar to switch metric/imperial. CSV export is unavailable without a real session key." } },
  },
} satisfies Meta<typeof WeatherPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dry: Story = {};
export const Rain: Story = {
  args: { entries: [{ ...reading, rainfall: 1, humidity: 92, track_temperature: 26 }] },
};
export const WarmingTrack: Story = {
  args: { entries: [reading, { ...reading, date: "2026-01-01T12:02:00Z", track_temperature: 42 }] },
};
export const CoolingTrack: Story = {
  args: { entries: [reading, { ...reading, date: "2026-01-01T12:02:00Z", track_temperature: 32 }] },
};
export const NoData: Story = { args: { entries: [] } };
