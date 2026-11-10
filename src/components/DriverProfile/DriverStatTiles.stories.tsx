import type { Meta, StoryObj } from "@storybook/react-vite";
import { DriverStatTiles } from "./DriverProfile";
import { driverSeasonStats } from "@/utils/driverProfile";
import { SAMPLE_CELLS, SAMPLE_ROUNDS, SAMPLE_STANDINGS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Profiles/Driver stats",
  component: DriverStatTiles,
  args: { stats: driverSeasonStats(SAMPLE_ROUNDS, SAMPLE_CELLS.get(7)!), points: SAMPLE_STANDINGS[0]!.points, position: 1 },
} satisfies Meta<typeof DriverStatTiles>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ChampionshipLeader: Story = {};
export const WithRetirement: Story = {
  args: { stats: driverSeasonStats(SAMPLE_ROUNDS, SAMPLE_CELLS.get(8)!), points: SAMPLE_STANDINGS[1]!.points, position: 2 },
};
export const BeforeSeason: Story = { args: { stats: driverSeasonStats([], []), points: 0, position: 1 } };
