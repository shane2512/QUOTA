import Link from "next/link";
import { Roundel } from "./Nav";

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div>
          <Link href="/" className="brand"><Roundel /> QUOTA</Link>
          <p className="small" style={{ marginTop: 12, maxWidth: "38ch" }}>
            Anonymous, deposit-backed rate limits for AI agents. Built for Monad Metropolis, Trust, Identity &amp; AI Infrastructure.
          </p>
        </div>
        <div>
          <h4>Product</h4>
          <Link href="/demo">Live demo</Link>
          <Link href="/operator">Operator console</Link>
          <Link href="/service">Service console</Link>
        </div>
        <div>
          <h4>Build</h4>
          <Link href="/docs#service">Service quickstart</Link>
          <Link href="/docs#agent">Agent quickstart</Link>
          <Link href="/docs#threats">Threat model</Link>
          <Link href="/docs#status">Integration status</Link>
        </div>
      </div>
    </footer>
  );
}
