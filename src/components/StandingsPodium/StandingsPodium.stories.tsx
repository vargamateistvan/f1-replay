import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { expect, within } from "storybook/test";
import { StandingsPodium } from "./StandingsPodium";
import { TOKEN_HEX } from "@/designTokens";
import { SAMPLE_DRIVER } from "../../../.storybook/fixtures";

const meta = {
  title: "Standings/Podium",
  component: StandingsPodium,
  args: {
    label: "Sample driver championship top three",
    entries: [
      { key: "ape", position: 1, label: "APE", detail: SAMPLE_DRIVER.full_name, color: TOKEN_HEX.blue, points: 280, driver: SAMPLE_DRIVER, href: "/standings/driver/7" },
      { key: "crv", position: 2, label: "CRV", detail: "Casey Curve", color: TOKEN_HEX.orange, points: 265, href: "/standings/driver/8" },
      { key: "rce", position: 3, label: "RCE", detail: "Riley Race", color: TOKEN_HEX.green, points: 240, href: "/standings/driver/9" },
    ],
  },
  decorators: [(Story) => <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Story /></MemoryRouter>],
  parameters: { docs: { description: { component: "Synthetic championship points and identities, not actual standings." } } },
} satisfies Meta<typeof StandingsPodium>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Drivers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(3);
    await expect(canvas.getByRole("link", { name: "P1 APE, 280 points" })).toHaveAttribute("href", "/standings/driver/7");
  },
};
export const Constructors: Story = {
  args: {
    label: "Sample constructor championship top three",
    entries: [
      { key: "blue", position: 1, label: "Blue Racing", detail: "8 wins", color: TOKEN_HEX.blue, points: 480 },
      { key: "orange", position: 2, label: "Orange Motorsport", detail: "5 wins", color: TOKEN_HEX.orange, points: 425 },
      { key: "green", position: 3, label: "Green Grand Prix", detail: "2 wins", color: TOKEN_HEX.green, points: 360 },
    ],
  },
};
export const TiedOnPoints: Story = {
  args: { entries: meta.args.entries.map((entry) => ({ ...entry, points: 280 })) },
};
export const SingleEntry: Story = { args: { entries: meta.args.entries.slice(0, 1) } };
