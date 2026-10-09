import Link from "next/link";
import { Mark } from "./Nav";

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-grid">
        <div>
          <Link href="/" className="brand"><Mark /><span>QUOTA</span></Link>
          <p className="small" style={{ marginTop: 16, maxWidth: "38ch" }}>
            Anonymous, deposit-backed rate limits for AI agents. Built for Monad Metropolis, Trust, Identity &amp; AI Infrastructure.
          </p>
        </div>
        <div>
          <h4>Product</h4>
          <Link href="/demo">Live demo</Link>
          <Link href="/operator">Operator console</Link>
          <Link href="/service">Service console</Link>
          <Link href="/slasher">Delegate your slasher</Link>
        </div>
        <div>
          <h4>Build</h4>
          <Link href="/docs#service">Service quickstart</Link>
          <Link href="/docs#agent">Agent quickstart</Link>
          <Link href="/docs#threats">Threat model</Link>
          <Link href="/docs#status">Integration status</Link>
        </div>
      </div>
      <div className="wrap foot-word" aria-hidden="true">QUOTA</div>
    </footer>
  );
}
