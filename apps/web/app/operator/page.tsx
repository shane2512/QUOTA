import Operator from "./Operator";
import PrivyShell from "@/components/PrivyShell";

export default function OperatorPage() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <div className="wrap shell">
        <header className="shell-head">
          <div><p className="label" style={{ marginBottom: 8 }}>Operator</p><h1>Your agents</h1></div>
          <span className="demo-note"><i />Login not configured</span>
        </header>
        <p className="empty" style={{ marginTop: 32 }}>Login is not configured on this deployment (no Privy app ID). Set NEXT_PUBLIC_PRIVY_APP_ID to stake for an agent from here.</p>
      </div>
    );
  }
  return (
    <PrivyShell appId={appId}>
      <Operator />
    </PrivyShell>
  );
}
