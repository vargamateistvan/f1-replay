import type { Meta, StoryObj } from "@storybook/react-vite";
import { PointsProgressionChart } from "./PointsProgressionChart";
import { RouterPreview } from "../../../.storybook/RouterPreview";
import { SAMPLE_CELLS, SAMPLE_ROUNDS, SAMPLE_STANDINGS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Charts/Championship progression",
  component: PointsProgressionChart,
  args: {
    rounds: SAMPLE_ROUNDS,
    series: SAMPLE_STANDINGS.map((standing, index) => {
      let total = 0;
      return {
        key: String(standing.driverNumber), label: standing.acronym, color: standing.color,
        dashed: index % 2 === 1,
        values: SAMPLE_CELLS.get(standing.driverNumber)!.map((cell) => total += cell?.points ?? 0),
      };
    }),
  },
  decorators: [(Story) => <RouterPreview><div className="min-w-0 border border-panel p-3"><Story /></div></RouterPreview>],
} satisfies Meta<typeof PointsProgressionChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Drivers: Story = {};
export const ProfileLinks: Story = {
  args: { series: meta.args.series.map((series) => ({ ...series, href: `/standings/driver/${series.key}` })) },
};
export const Loading: Story = { args: { rounds: [], loading: true } };
export const Empty: Story = { args: { rounds: [] } };
