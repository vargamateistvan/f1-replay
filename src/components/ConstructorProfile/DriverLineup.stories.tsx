import type { Meta, StoryObj } from "@storybook/react-vite";
import { DriverLineup } from "./ConstructorProfile";
import { RouterPreview } from "../../../.storybook/RouterPreview";
import { SAMPLE_STANDINGS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Profiles/Driver lineup",
  component: DriverLineup,
  args: {
    drivers: SAMPLE_STANDINGS.slice(0, 2),
    teamPoints: SAMPLE_STANDINGS[0]!.points + SAMPLE_STANDINGS[1]!.points,
    color: SAMPLE_STANDINGS[0]!.color,
    search: "?year=2026",
  },
  decorators: [(Story) => <RouterPreview><div className="max-w-xl border border-panel p-4"><Story /></div></RouterPreview>],
} satisfies Meta<typeof DriverLineup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PointsShare: Story = {};
export const ZeroPoints: Story = {
  args: { teamPoints: 0, drivers: meta.args.drivers.map((driver) => ({ ...driver, points: 0 })) },
};
export const SingleDriver: Story = { args: { drivers: meta.args.drivers.slice(0, 1), teamPoints: SAMPLE_STANDINGS[0]!.points } };
