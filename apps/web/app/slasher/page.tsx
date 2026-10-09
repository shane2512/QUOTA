import Slasher from "./Slasher";

export default function SlasherPage() {
  return <Slasher environmentId={process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? ""} />;
}
