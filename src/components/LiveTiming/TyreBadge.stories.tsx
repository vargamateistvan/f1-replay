import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Stint } from "@/api/types";
import { TyreBadge } from "./TyreBadge";
import { SAMPLE_DRIVER } from "../../../.storybook/fixtures";

const stint: Stint = {
  driver_number: SAMPLE_DRIVER.driver_number,
  compound: "MEDIUM",
  lap_start: 12,
  lap_end: 30,
  tyre_age_at_start: 0,
  stint_number: 2,
  session_key: 1,
  meeting_key: 1,
};
const meta = {
  title: "Racing/Tyre badge",
  component: TyreBadge,
  args: {
    stints: [stint],
    driverNumber: SAMPLE_DRIVER.driver_number,
    currentLap: 20,
    startCompound: "SOFT",
  },
  decorators: [(Story) => <div className="w-16"><Story /></div>],
} satisfies Meta<typeof TyreBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentStint: Story = {};
export const FreshTyres: Story = { args: { currentLap: stint.lap_start } };
export const UsedTyres: Story = { args: { stints: [{ ...stint, tyre_age_at_start: 4 }] } };
export const NoActiveStint: Story = { args: { currentLap: 1 } };
