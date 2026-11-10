import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ResultsGrid } from "./ResultsGrid";
import { RouterPreview } from "../../../.storybook/RouterPreview";
import { SAMPLE_CELLS, SAMPLE_ROUNDS, SAMPLE_STANDINGS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Results/Season grid",
  component: ResultsGrid,
  args: { rounds: SAMPLE_ROUNDS, standings: SAMPLE_STANDINGS, cells: SAMPLE_CELLS },
  decorators: [(Story) => <RouterPreview><Story /></RouterPreview>],
} satisfies Meta<typeof ResultsGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Positions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^points$/i }));
    await expect(canvas.getByRole("button", { name: /^points$/i })).toHaveAttribute("aria-pressed", "true");
  },
};
export const ProfileLinks: Story = { args: { driverHref: (number) => `/standings/driver/${number}` } };
export const Loading: Story = { args: { rounds: [], loading: true } };
export const Empty: Story = { args: { rounds: [] } };
