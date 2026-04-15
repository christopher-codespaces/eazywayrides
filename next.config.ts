import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  /**
   * Cross-Origin headers for Firebase Authentication
   * =============================================================================
   * Firebase Auth (especially Google sign-in via popup) requires specific headers
   * to allow cross-origin communication between the popup and parent window.
   *
   * Cross-Origin-Opener-Policy: same-origin-allow-popups
   * - Allows popups to communicate with the parent window
   * - Required for signInWithPopup to work correctly
   *
   * Cross-Origin-Embedder-Policy: credentialless (or require-corp)
   * - Controls how cross-origin resources are embedded
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
