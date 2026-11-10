import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConstructorStatTiles } from "./ConstructorProfile";
import { constructorSeasonStats } from "@/utils/constructorProfile";
import { SAMPLE_CELLS, SAMPLE_ROUNDS, SAMPLE_STANDINGS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Profiles/Constructor stats",
  component: ConstructorStatTiles,
  args: {
    stats: constructorSeasonStats(SAMPLE_ROUNDS, [SAMPLE_CELLS.get(7)!, SAMPLE_CELLS.get(8)!]),
    points: SAMPLE_STANDINGS[0]!.points + SAMPLE_STANDINGS[1]!.points,
    position: 1,
  },
} satisfies Meta<typeof ConstructorStatTiles>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TeamSeason: Story = {};
export const BeforeSeason: Story = { args: { stats: constructorSeasonStats([], []), points: 0 } };
