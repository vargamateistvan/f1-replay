import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip, ChipField, OptionRow, SectionHeader, Segmented, SettingRow } from "./index";

const meta = {
  title: "UI/Layout",
  component: OptionRow,
  args: { label: "Units", description: "Choose display units", children: null },
} satisfies Meta<typeof OptionRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ControlRow: Story = {
  render: function Render(args) {
    const [value, setValue] = useState("metric");
    return <OptionRow {...args}>
      <Segmented value={value} onChange={setValue} options={[
        { value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" },
      ]} />
    </OptionRow>;
  },
};
export const StackedOnMobile: Story = { ...ControlRow, args: { stackOnMobile: true } };
export const Section: Story = {
  render: () => <SectionHeader>Notifications</SectionHeader>,
};
export const ChipGroup: Story = {
  render: function Render() {
    const [active, setActive] = useState(true);
    return <ChipField label="Event types" description="Choose which events appear">
      <Chip label="Flags" tone="yellow" active={active} onToggle={() => setActive(!active)} />
      <Chip label="Pit stops" active={false} disabled onToggle={() => undefined} />
    </ChipField>;
  },
};
export const SettingsPanel: Story = {
  render: function Render() {
    const [enabled, setEnabled] = useState(true);
    return <div className="max-w-xl border border-panel bg-surface p-4">
      <SectionHeader>Track map</SectionHeader>
      <SettingRow label="Weather effects" description="Show rain on the track" checked={enabled} onChange={setEnabled} />
      <ChipField label="Visible events" muted>
        <Chip label="Flags" tone="yellow" active={enabled} disabled={!enabled} onToggle={() => setEnabled(!enabled)} />
      </ChipField>
    </div>;
  },
};
