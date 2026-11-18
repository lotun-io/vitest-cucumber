// A run's `meta` message: a placeholder with the fields the protocol requires, the protocol's version
// and the plugin's name only. The stream is the e2e and compatibility harness's (the compatibility
// kit leaves `meta` out of its comparison, each implementation's own), so nothing reads where the
// run ran: no runtime, OS, CPU or CI detected.
import { type Envelope, version as protocolVersion } from "@cucumber/messages";

/** The `meta` of every run. */
export const metaEnvelope: Envelope = {
  meta: {
    protocolVersion,
    implementation: { name: "@lotun/vitest-cucumber" },
    runtime: { name: "" },
    os: { name: "" },
    cpu: { name: "" },
  },
};
