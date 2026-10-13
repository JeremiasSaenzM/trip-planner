import { isDemoMode } from "@/lib/demo-mode";

import { demoDataSource } from "./demo";
import { realDataSource } from "./real";

// The one switch point. Pages and components import only from here, and
// never from ./real or ./demo directly, so they never know which one
// they're using.
export const dataSource = isDemoMode() ? demoDataSource : realDataSource;
