import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./redis";

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  if (!ratelimit) {
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "@upstash/ratelimit",
    });
  }
  return ratelimit;
}

export async function checkRateLimit(request: Request): Promise<Response | null> {
  const limiter = getRatelimit();
  if (!limiter) return null;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const { success, limit, remaining, reset } = await limiter.limit(ip);

  if (!success) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": String(reset),
          "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
        },
      }
    );
  }

  return null;
}
