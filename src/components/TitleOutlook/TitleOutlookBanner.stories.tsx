import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { TitleOutlookBanner } from "./TitleOutlookBanner";
import { SAMPLE_STANDINGS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Standings/Title outlook",
  component: TitleOutlookBanner,
  args: {
    scope: "driver",
    remaining: { races: 2, sprints: 1, driver: 58, team: 101 },
    entries: SAMPLE_STANDINGS.map((standing, i) => ({
      key: String(standing.driverNumber), label: standing.acronym,
      color: standing.color, points: standing.points,
      title: { status: i === 0 ? "leader" as const : "contender" as const, maxPoints: standing.points + 58 },
    })),
  },
} satisfies Meta<typeof TitleOutlookBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TitleFight: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("4 drivers in contention");
  },
};
export const Clinched: Story = {
  args: {
    entries: [{ ...meta.args.entries[0]!, title: { status: "champion", maxPoints: 133 } }],
  },
};
export const SeasonComplete: Story = {
  args: {
    remaining: { races: 0, sprints: 0, driver: 0, team: 0 },
    entries: [{ ...meta.args.entries[0]!, title: { status: "champion", maxPoints: 75 } }],
  },
};
