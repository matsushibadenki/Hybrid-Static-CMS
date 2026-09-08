import { createMailRoute } from "../../../lib/nextMail";

export const runtime = "nodejs";

let handler: ReturnType<typeof createMailRoute> | undefined;

export async function POST(request: Request) {
  try {
    handler ??= createMailRoute();
  } catch {
    return new Response(null, { status: 503 });
  }
  return handler(request);
}
