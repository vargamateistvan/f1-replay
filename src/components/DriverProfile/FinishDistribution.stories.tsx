import type { Meta, StoryObj } from "@storybook/react-vite";
import { FinishDistribution } from "./DriverProfile";

const meta = {
  title: "Profiles/Finish distribution",
  component: FinishDistribution,
  args: { counts: { win: 2, podium: 4, points: 5, noPoints: 2, dnf: 1 } },
} satisfies Meta<typeof FinishDistribution>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MixedSeason: Story = {};
export const PerfectSeason: Story = { args: { counts: { win: 12, podium: 0, points: 0, noPoints: 0, dnf: 0 } } };
export const Empty: Story = { args: { counts: { win: 0, podium: 0, points: 0, noPoints: 0, dnf: 0 } } };
