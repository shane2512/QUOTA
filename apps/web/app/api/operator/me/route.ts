import { authenticate, handle, operatorState } from "@/lib/operator-server";

export const maxDuration = 60;

export async function GET(req: Request) {
  return handle(async () => operatorState(await authenticate(req)));
}
