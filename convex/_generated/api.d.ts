/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as app from "../app.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as finance from "../finance.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_readModels from "../lib/readModels.js";
import type * as participation from "../participation.js";
import type * as permissions from "../permissions.js";
import type * as rooms from "../rooms.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  app: typeof app;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  finance: typeof finance;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/money": typeof lib_money;
  "lib/readModels": typeof lib_readModels;
  participation: typeof participation;
  permissions: typeof permissions;
  rooms: typeof rooms;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
