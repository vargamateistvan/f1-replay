import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { TyreChange } from "./TyreChange";

const meta = {
  title: "Racing/Tyre change",
  component: TyreChange,
  args: {
    off: { compound: "SOFT", age: 18 },
    on: { compound: "HARD", age: 0 },
    compact: false,
  },
} satisfies Meta<typeof TyreChange>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NewTyres: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("img", { name: "Off: Soft after 18 laps · On: New Hard" })).toBeVisible();
  },
};
export const UsedTyres: Story = { args: { on: { compound: "MEDIUM", age: 3 } } };
export const WetWeather: Story = {
  args: { off: { compound: "INTERMEDIATE", age: 12 }, on: { compound: "WET", age: 0 } },
};
export const Compact: Story = { args: { compact: true } };
export const IncomingOnly: Story = { args: { off: null } };
