import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ErrorMessage } from "./ErrorMessage";

const meta = {
  title: "Feedback/Error message",
  component: ErrorMessage,
  args: { message: "Failed to load session data", variant: "error", compact: false },
  argTypes: { variant: { control: "select", options: ["error", "empty"] } },
} satisfies Meta<typeof ErrorMessage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Error: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("Failed to load session data");
  },
};
export const Empty: Story = {
  args: { variant: "empty", message: "No team radio for this session" },
};
export const CompactError: Story = { args: { compact: true } };
export const CompactEmpty: Story = {
  args: { compact: true, variant: "empty", message: "No laps recorded" },
};
export const LongMessage: Story = {
  args: { message: "Session timing is unavailable. Try again after checking your connection." },
};
