import { lazy, Suspense, useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import { Button } from "@/components/UI";
import { mapboxToken, supportsWebGL2 } from "./availability";
import { MiniMap } from "./MiniMap";
import { buildMiniMapProjection } from "./miniMapProjection";
import { buildDriverIndexes } from "@/timeline/interpolate";
import { useSettings } from "@/stores/settings";
import { TrackPreview, TrackSetupNotice } from "../../../.storybook/TrackPreview";
import {
  RAIN_WEATHER,
  loadTrackGeometry,
  TRACK_ARGS,
  TRACK_DRIVERS,
  TRACK_DURATION_MS,
  TRACK_GEOMETRY,
} from "../../../.storybook/trackFixtures";
import type { TrackMap3D } from "./TrackMap3D";

const LazyTrackMap3D = lazy(() => import("./TrackMap3D").then((module) => ({ default: module.TrackMap3D })));
const projection = buildMiniMapProjection(TRACK_GEOMETRY, 240, 12);
const indexes = buildDriverIndexes(TRACK_ARGS.locationData, TRACK_ARGS.sessionStartMs);
const driverByNumber = new Map(TRACK_DRIVERS.map((driver) => [driver.driver_number, driver]));

function OptInTrackMap3D(args: ComponentProps<typeof TrackMap3D>) {
  const [started, setStarted] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const lightMode = useSettings((state) => state.lightMode);
  const tokenAvailable = mapboxToken() !== null;

  if (unsupported) {
    return <TrackSetupNotice message="3D preview requires WebGL2. Use a browser with hardware acceleration." />;
  }
  if (started) {
    return <Suspense fallback={<TrackSetupNotice message="Loading the 3D track view" />}>
      <LazyTrackMap3D {...args} onExit3d={() => {
        setStarted(false);
        args.onExit3d();
      }} />
    </Suspense>;
  }
  return <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
    {projection && <MiniMap
      projection={projection}
      indexes={indexes}
      driverByNumber={driverByNumber}
      t={args.previewTimeMs ?? 0}
      highlight={new Set(args.focusDriver == null ? [] : [args.focusDriver])}
      background="transparent"
      lightMode={lightMode}
    />}
    <p className="max-w-md text-center text-body text-muted">
      This is the 3D camera&apos;s offline overview, not the 3D map.
      {tokenAvailable
        ? " Starting the actual 3D view contacts Mapbox and may incur a billed map load."
        : " Set VITE_MAPBOX_TOKEN in .env.local and restart Storybook to enable the actual 3D view."}
    </p>
    <Button disabled={!tokenAvailable} onClick={() => {
      if (!supportsWebGL2()) {
        setUnsupported(true);
        return;
      }
      setStarted(true);
    }}>Start 3D preview</Button>
  </div>;
}

const meta = {
  title: "Tracks/3D",
  component: OptInTrackMap3D,
  args: {
    ...TRACK_ARGS,
    onExit3d: fn(),
    onSelectDriver: fn(),
    initialCameraMode: "follow",
  },
  loaders: [loadTrackGeometry],
  decorators: [(Story) => <TrackPreview><Story /></TrackPreview>],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <OptInTrackMap3D {...args} onSelectDriver={(focusDriver) => {
      args.onSelectDriver?.(focusDriver);
      updateArgs({ focusDriver });
    }} />;
  },
  argTypes: {
    previewTimeMs: { control: { type: "range", min: 0, max: TRACK_DURATION_MS, step: 500 } },
    initialCameraMode: { control: "select", options: ["follow", "chase", "onboard", "orbit"] },
    locationData: { control: false },
    activeCompounds: { control: false },
  },
  parameters: {
    docs: { description: { component: "The real Mapbox 3D component is lazy-loaded only after explicitly starting the preview. Requires VITE_MAPBOX_TOKEN, WebGL2 and network access. Each start is a Mapbox map load; docs and normal story navigation do not automatically create maps. Cars are synthetic and OpenF1 telemetry is disabled." } },
  },
} satisfies Meta<typeof OptInTrackMap3D>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const ChaseCamera: Story = { args: { focusDriver: 7, initialCameraMode: "chase" } };
export const OnboardCamera: Story = { args: { focusDriver: 7, initialCameraMode: "onboard" } };
export const OrbitCamera: Story = { args: { focusDriver: 7, initialCameraMode: "orbit" } };
export const Rain: Story = { args: { weather: RAIN_WEATHER, weatherOverlay: RAIN_WEATHER } };
