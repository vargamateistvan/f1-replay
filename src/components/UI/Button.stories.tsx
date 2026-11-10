import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button, buttonClass } from "./index";

const meta = {
  title: "UI/Button",
  component: Button,
  args: { children: "Open replay", onClick: fn(), variant: "primary", size: "md" },
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "quiet"] },
    size: { control: "select", options: ["md", "sm", "block"] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    await expect(args.onClick).toHaveBeenCalled();
  },
};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Quiet: Story = { args: { variant: "quiet", size: "sm" } };
export const FullWidth: Story = { args: { size: "block" } };
export const Disabled: Story = { args: { disabled: true } };
export const StyledLink: Story = {
  render: () => <a className={buttonClass("secondary")} href="#replay">Open replay</a>,
};
