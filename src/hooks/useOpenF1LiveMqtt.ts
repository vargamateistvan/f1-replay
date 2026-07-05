import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import mqtt from "mqtt";
import type { MqttClient } from "mqtt";
import {
  LIVE_MQTT_MAX_ROWS,
  OPENF1_MQTT_CONNECT_TIMEOUT_MS,
  OPENF1_MQTT_WSS_URL,
} from "@/constants";

type MqttPayload = {
  _id?: number;
  _key?: string;
  session_key?: number;
  date?: string;
  date_start?: string;
  driver_number?: number;
  lap_number?: number;
  message?: string;
  recording_url?: string;
  overtaking_driver_number?: number;
  overtaken_driver_number?: number;
};

type TopicConfig = {
  topic: string;
  queryKey: readonly [string, number];
  buildKey: (row: MqttPayload) => string;
  buildSortKey: (row: MqttPayload) => number;
  maxRows?: number;
};

const TOPIC_TO_QUERY = {
  "v1/position": {
    topic: "v1/position",
    queryKeyName: "positions",
    buildKey: (row: MqttPayload) =>
      row._key ?? `${row.date}_${row.driver_number}`,
    buildSortKey: (row: MqttPayload) => Date.parse(row.date ?? ""),
  },
  "v1/intervals": {
    topic: "v1/intervals",
    queryKeyName: "intervals",
    buildKey: (row: MqttPayload) =>
      row._key ?? `${row.date}_${row.driver_number}`,
    buildSortKey: (row: MqttPayload) => Date.parse(row.date ?? ""),
  },
  "v1/laps": {
    topic: "v1/laps",
    queryKeyName: "laps",
    buildKey: (row: MqttPayload) =>
      row._key ?? `${row.driver_number}_${row.lap_number}_${row.date_start}`,
    buildSortKey: (row: MqttPayload) => Date.parse(row.date_start ?? ""),
  },
  "v1/race_control": {
    topic: "v1/race_control",
    queryKeyName: "raceControl",
    buildKey: (row: MqttPayload) =>
      row._key ?? `${row.date}_${row.message}_${row.driver_number ?? -1}`,
    buildSortKey: (row: MqttPayload) => Date.parse(row.date ?? ""),
  },
  "v1/team_radio": {
    topic: "v1/team_radio",
    queryKeyName: "teamRadio",
    buildKey: (row: MqttPayload) =>
      row._key ?? `${row.date}_${row.driver_number}_${row.recording_url}`,
    buildSortKey: (row: MqttPayload) => Date.parse(row.date ?? ""),
  },
  "v1/weather": {
    topic: "v1/weather",
    queryKeyName: "weather",
    buildKey: (row: MqttPayload) => row._key ?? `${row.date}`,
    buildSortKey: (row: MqttPayload) => Date.parse(row.date ?? ""),
  },
  "v1/overtakes": {
    topic: "v1/overtakes",
    queryKeyName: "overtakes",
    buildKey: (row: MqttPayload) =>
      row._key ??
      `${row.date}_${row.overtaking_driver_number}_${row.overtaken_driver_number}`,
    buildSortKey: (row: MqttPayload) => Date.parse(row.date ?? ""),
  },
} as const;

function mergeRow(
  prev: MqttPayload[] | undefined,
  incoming: MqttPayload,
  config: Pick<TopicConfig, "buildKey" | "buildSortKey" | "maxRows">,
): MqttPayload[] {
  const existing = prev ?? [];
  const key = config.buildKey(incoming);
  const idx = existing.findIndex((row) => config.buildKey(row) === key);

  const next = [...existing];
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...incoming };
  } else {
    next.push(incoming);
  }

  next.sort((a, b) => config.buildSortKey(a) - config.buildSortKey(b));

  const maxRows = config.maxRows ?? LIVE_MQTT_MAX_ROWS;
  if (next.length <= maxRows) return next;
  return next.slice(next.length - maxRows);
}

function getLiveMqttToken(): string | null {
  return (
    import.meta.env.VITE_OPENF1_MQTT_TOKEN ??
    import.meta.env.VITE_OPENF1_API_KEY ??
    null
  );
}

export function useOpenF1LiveMqtt(
  sessionKey: number | null,
  isLive: boolean,
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLive || sessionKey === null) return;

    const token = getLiveMqttToken();
    if (!token) return;

    const url = import.meta.env.VITE_OPENF1_MQTT_WSS_URL ?? OPENF1_MQTT_WSS_URL;
    const username = import.meta.env.VITE_OPENF1_MQTT_USERNAME ?? "f1-replay";

    const client: MqttClient = mqtt.connect(url, {
      username,
      password: token,
      reconnectPeriod: 5_000,
      connectTimeout: OPENF1_MQTT_CONNECT_TIMEOUT_MS,
      keepalive: 30,
      clean: true,
      protocolVersion: 4,
    });

    const topics = Object.keys(TOPIC_TO_QUERY);

    client.on("connect", () => {
      client.subscribe(topics, (err) => {
        if (err) console.warn("OpenF1 MQTT subscribe failed", err);
      });
    });

    client.on("message", (topic, rawMessage) => {
      const config =
        TOPIC_TO_QUERY[topic as keyof typeof TOPIC_TO_QUERY] ?? null;
      if (!config) return;

      let parsed: MqttPayload;
      try {
        parsed = JSON.parse(rawMessage.toString()) as MqttPayload;
      } catch {
        return;
      }

      if (parsed.session_key !== sessionKey) return;

      const queryKey = [config.queryKeyName, sessionKey] as const;
      queryClient.setQueryData(queryKey, (prev) =>
        mergeRow(prev as MqttPayload[] | undefined, parsed, config),
      );

      // Keep the all-driver lap query in sync too (`["laps", sessionKey, undefined]`).
      if (topic === "v1/laps") {
        queryClient.setQueryData(["laps", sessionKey, undefined], (prev) =>
          mergeRow(prev as MqttPayload[] | undefined, parsed, config),
        );
      }
    });

    client.on("error", (err) => {
      console.warn("OpenF1 MQTT connection error", err);
    });

    return () => {
      client.end(true);
    };
  }, [isLive, queryClient, sessionKey]);
}
