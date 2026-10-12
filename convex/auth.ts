import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google({
    profile(profile) {
      if (profile.email_verified !== true || !profile.email) throw new Error("A verified Google email is required.");
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
});
