import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { CommentaryDriver, CommentaryRow } from "./CommentaryRow";
import { TyreChange } from "@/components/TyreChange/TyreChange";
import { TOKEN_HEX } from "@/designTokens";
import { SAMPLE_DRIVER } from "../../../.storybook/fixtures";

const meta = {
  title: "Racing/Commentary row",
  component: CommentaryRow,
  args: {
    ms: 754000,
    badge: { label: "Flag", className: "border-yellow-line bg-yellow-tint text-yellow-fg" },
    title: "Yellow flag in sector 2",
    meta: "Lap 12",
    accent: TOKEN_HEX.yellow,
    jumpLabel: "yellow flag",
    onJump: fn(),
  },
  decorators: [(Story) => <div className="max-w-2xl border border-panel bg-surface"><Story /></div>],
} satisfies Meta<typeof CommentaryRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Flag: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Jump to yellow flag at 12:34" }));
    await expect(args.onJump).toHaveBeenCalledWith(754000);
  },
};
export const Upcoming: Story = { args: { upcoming: true } };
export const ActiveChapter: Story = {
  args: { active: true, rowClickable: true, badge: { label: "Chapter" }, title: "The pit window opens" },
};
export const LongMessage: Story = {
  args: {
    title: "Track limits at turn 4 will be monitored. Drivers must remain within the white lines on corner exit.",
    titleLines: 2,
  },
};
export const PitStop: Story = {
  args: {
    badge: { label: "Pit", className: "border-blue-line bg-blue-tint text-blue-fg" },
    accent: TOKEN_HEX.blue,
    title: <><CommentaryDriver driver={SAMPLE_DRIVER} driverNumber={SAMPLE_DRIVER.driver_number} showName /> pits for hard tyres</>,
    meta: "Lap 18 · Stop 2.4s",
    jumpLabel: "pit stop",
    children: <span className="mt-2 block"><TyreChange off={{ compound: "SOFT", age: 18 }} on={{ compound: "HARD", age: 0 }} /></span>,
  },
};
