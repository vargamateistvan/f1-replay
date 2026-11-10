import type { Driver } from "../src/api/types";
import { TOKEN_HEX } from "../src/designTokens";

/** Synthetic identities, without remote headshot requests or session dependencies. */
export const SAMPLE_DRIVER: Driver = {
  driver_number: 7,
  broadcast_name: "A APEX",
  full_name: "Alex Apex",
  name_acronym: "APE",
  team_name: "Blue Racing",
  team_colour: TOKEN_HEX.blue.slice(1),
  first_name: "Alex",
  last_name: "Apex",
  headshot_url: null,
  country_code: null,
  session_key: 1,
  meeting_key: 1,
};
