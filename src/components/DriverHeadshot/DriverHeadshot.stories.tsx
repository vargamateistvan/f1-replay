import type { Meta, StoryObj } from "@storybook/react-vite";
import { DriverHeadshot } from "./DriverHeadshot";
import { SAMPLE_DRIVER } from "../../../.storybook/fixtures";
import { TOKEN_HEX } from "@/designTokens";

const meta = {
  title: "Racing/Driver headshot",
  component: DriverHeadshot,
  args: { driver: SAMPLE_DRIVER, accent: TOKEN_HEX.blue, size: "md" },
  argTypes: { size: { control: "select", options: ["xxs", "xs", "sm", "md", "lg"] } },
  parameters: {
    docs: { description: { component: "Fallback initials use a synthetic driver; no remote image requests are made." } },
  },
} satisfies Meta<typeof DriverHeadshot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};
export const UnknownDriver: Story = { args: { driver: undefined } };
export const NumberFallback: Story = {
  args: { driver: { ...SAMPLE_DRIVER, name_acronym: "" } },
};
export const Large: Story = { args: { size: "lg" } };
export const AllSizes: Story = {
  render: (args) => <div className="flex items-center gap-4">
    {(["xxs", "xs", "sm", "md", "lg"] as const).map((size) =>
      <DriverHeadshot {...args} key={size} size={size} />,
    )}
  </div>,
};
