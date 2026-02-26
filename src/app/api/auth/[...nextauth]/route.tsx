// src/app/api/auth/[...nextauth]/route.ts
// NextAuth route handler (App Router)
// Handles both GET and POST for auth callbacks

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// NextAuth config
// - Google OAuth only (for now)
// - Secrets come from env vars
export const authOptions = {
  providers: [
    GoogleProvider({
      // Public OAuth client ID
      clientId: process.env.GOOGLE_CLIENT_ID!,

      // Private OAuth client secret
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  // Used to sign/encrypt session tokens
  secret: process.env.NEXTAUTH_SECRET,
};

// Single handler wired to both HTTP methods
// Required by Next.js App Router
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
