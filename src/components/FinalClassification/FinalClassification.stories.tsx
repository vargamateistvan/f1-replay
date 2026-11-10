import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { FinalClassification } from "./FinalClassification";
import { RouterPreview } from "../../../.storybook/RouterPreview";
import { SAMPLE_DRIVERS, SAMPLE_RESULTS } from "../../../.storybook/resultsFixtures";

const meta = {
  title: "Results/Final classification",
  component: FinalClassification,
  args: { drivers: SAMPLE_DRIVERS, results: SAMPLE_RESULTS, sessionName: "Race" },
  decorators: [(Story) => <RouterPreview><Story /></RouterPreview>],
  parameters: {
    docs: { description: { component: "Synthetic classification illustrating race points, qualifying phases and unclassified drivers. No official result or API request." } },
  },
} satisfies Meta<typeof FinalClassification>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Race: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("table")).toBeVisible();
    await expect(within(canvasElement).getAllByText("DNF", { exact: true })[0]).toBeVisible();
  },
};
export const Qualifying: Story = {
  args: {
    sessionName: "Qualifying",
    results: SAMPLE_RESULTS.map((result, i) => ({
      ...result, position: i + 1, dnf: false, points: null,
      duration: i === 3 ? [91.2] : [90 + i * 0.2, 89.5 + i * 0.2, 89 + i * 0.2],
      gap_to_leader: [i * 0.2, i * 0.2, i * 0.2],
    })),
  },
};
export const Practice: Story = {
  args: { sessionName: "Practice 1", results: SAMPLE_RESULTS.map((result, i) => ({
    ...result, position: i + 1, dnf: false, points: null, duration: 89 + i * 0.4, gap_to_leader: i * 0.4,
  })) },
};
export const ProfileLinks: Story = { args: { year: 2026, sessionKey: 1 } };
export const DidNotStart: Story = {
  args: { results: SAMPLE_RESULTS.map((result, i) => i === 3
    ? { ...result, dnf: false, dns: true, number_of_laps: 0 } : result) },
};
export const Empty: Story = { args: { results: [] } };
