import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { env } from "./_generated/server";
import { allowedAuthRedirect } from "./lib/authRedirect";
import { requireMaintenanceAccess } from "./lib/maintenanceAccess";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google({
    profile(profile) {
      if (profile.email_verified !== true || !profile.email) throw new Error("A verified Google email is required.");
      requireMaintenanceAccess(profile.email);
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture,
        // Convex Auth otherwise treats OAuth email as verified by default.
        emailVerified: profile.email_verified === true,
      };
    },
  })],
  callbacks: {
    async redirect({ redirectTo }) {
      const studentSite = env.SITE_URL;
      if (!studentSite) throw new Error("SITE_URL is not configured");
      return allowedAuthRedirect(redirectTo, studentSite, env.TIMECLOCK_SITE_URL);
    },
  },
});
