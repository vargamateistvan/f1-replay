import type { Meta, StoryObj } from "@storybook/react-vite";
import { TeammateComparison } from "./TeammateComparison";
import { RouterPreview } from "../../../.storybook/RouterPreview";
import { SAMPLE_STANDINGS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Standings/Teammate comparison",
  component: TeammateComparison,
  args: {
    comparisons: [
      { team: "Blue Racing", color: SAMPLE_STANDINGS[0]!.color, a: SAMPLE_STANDINGS[0]!, b: SAMPLE_STANDINGS[1]!, qualifying: { a: 2, b: 1 }, race: { a: 2, b: 1 } },
      { team: "Orange Motorsport", color: SAMPLE_STANDINGS[2]!.color, a: SAMPLE_STANDINGS[2]!, b: SAMPLE_STANDINGS[3]!, qualifying: { a: 2, b: 1 }, race: { a: 2, b: 1 } },
    ],
  },
  decorators: [(Story) => <RouterPreview><Story /></RouterPreview>],
} satisfies Meta<typeof TeammateComparison>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Teams: Story = {};
export const QualifyingLoading: Story = { args: { qualifyingLoading: true } };
export const ProfileLinks: Story = {
  args: { driverHref: (number) => `/standings/driver/${number}`, teamHref: (team) => `/standings/team/${encodeURIComponent(team)}` },
};
export const Empty: Story = { args: { comparisons: [] } };
