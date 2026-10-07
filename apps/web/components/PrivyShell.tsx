"use client";
import { PrivyProvider } from "@privy-io/react-auth";

/// Email login only. We never create a Privy embedded wallet in the browser: the operator's wallet is a
/// server wallet owned by this user (see lib/operator-server.ts), and custody is a WebAuthn passkey.
export default function PrivyShell({ appId, children }: { appId: string; children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
        appearance: { theme: "light" },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
