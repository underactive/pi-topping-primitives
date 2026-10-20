/**
 * Environment flags the toppings read the way pi does.
 *
 * Contract:
 * - Pure and synchronous. Nothing is read at import time, there is no module state, and no pi
 *   package is imported, so this loads with the peers absent.
 * - `suppressNotifications` reads `process.env` when it is called, never earlier, and takes an
 *   explicit environment for tests.
 * - Only the flag rule pi itself uses lives here. A host's own variables keep their own
 *   readers.
 */

export { isTruthyEnvFlag, suppressNotifications } from "./flags.js";
