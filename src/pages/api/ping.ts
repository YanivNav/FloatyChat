import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
    console.log("Received ping request");
    return new Response("pong");
}