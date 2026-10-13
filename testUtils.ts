import { convexTest } from "convex-test";
import aggregate from "@convex-dev/aggregate/test";
import type projectSchema from "./convex/schema";

/** Register the reporting component for source mutations that maintain projections. */
export function createTest(schema: typeof projectSchema, modules: Record<string, () => Promise<unknown>>) {
  const t = convexTest(schema, modules);
  aggregate.register(t, "reportAggregates");
  return t;
}
