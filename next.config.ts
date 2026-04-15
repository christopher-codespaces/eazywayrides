const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            // MUST be this value for popups to function
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            // If popups still fail, set this to 'unsafe-none' temporarily
            value: "credentialless",
          },
        ],
      },
    ];
  },
};
