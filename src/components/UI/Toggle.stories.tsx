import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Toggle } from "./index";

const meta = {
  title: "UI/Toggle",
  component: Toggle,
  args: { checked: false, disabled: false, "aria-label": "Weather effects", onChange: fn() },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <Toggle {...args} onChange={(checked) => {
      args.onChange(checked);
      updateArgs({ checked });
    }} />;
  },
} satisfies Meta<typeof Toggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole("switch", { name: "Weather effects" });
    await userEvent.click(control);
    await waitFor(() => expect(control).toBeChecked());
  },
};
export const On: Story = { args: { checked: true } };
export const Disabled: Story = { args: { disabled: true } };
