import Operator from "./Operator";
import PrivyShell from "@/components/PrivyShell";

export default function OperatorPage() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <div className="wrap shell">
        <h1>Operator console</h1>
        <p className="small" style={{ marginTop: 12 }}>Login is not configured on this deployment (no Privy app ID).</p>
      </div>
    );
  }
  return (
    <PrivyShell appId={appId}>
      <Operator />
    </PrivyShell>
  );
}
