import { HttpError, authenticate, handle, relay, type RelayBody } from "@/lib/operator-server";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const userId = await authenticate(req);
    let body: RelayBody;
    try {
      body = (await req.json()) as RelayBody;
    } catch {
      throw new HttpError(400, "bad request body");
    }
    return relay(userId, body);
  });
}
