import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./pushEndpoint";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:443/wp/abc",
    "https://web.push.apple.com/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("allows %s", url => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://127.0.0.1/x",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/x",
    "https://[::1]/x",
    "https://fcm.googleapis.com:8443/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com.evil.com/x",
    "https://evilfcm.googleapis.com/x",
    "https://push.apple.com.evil.com/x",
    "https://evil.com/?h=fcm.googleapis.com",
    "https://notify.windows.com/x",
    "https://evil.com#@fcm.googleapis.com",
    "not a url",
    "",
  ])("rejects %s", url => expect(isAllowedPushEndpoint(url)).toBe(false));
});
