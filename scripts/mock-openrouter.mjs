#!/usr/bin/env node
/**
 * Minimal OpenAI-compatible chat-completions mock for offline testing of
 * /api/ai/analyze. Streams a canned SSE response.
 *
 * Usage: node scripts/mock-openrouter.mjs [port]
 * Point the app at it with OPENROUTER_BASE_URL=http://127.0.0.1:4545/api/v1
 */
import http from "node:http";

const PORT = Number(process.argv[2] ?? 4545);

const REPLY =
  "Strong session overall. Your braking into the final corner is 0.4s late — " +
  "brake at the 100m board instead of 50m. Carry 4th gear through T3 and stay " +
  "on full throttle 150m earlier on the main straight.";

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!req.url?.includes("/chat/completions")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const id = "chatcmpl-mock";
    const chunks = REPLY.match(/.{1,40}/g) ?? [];
    let i = 0;
    const send = () => {
      if (i < chunks.length) {
        res.write(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "openai/gpt-4o-mini",
            choices: [{ index: 0, delta: { content: chunks[i] }, finish_reason: null }],
          })}\n\n`
        );
        i++;
        setTimeout(send, 5);
      } else {
        res.write(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "openai/gpt-4o-mini",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        res.end();
      }
    };
    send();
  });
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`mock-openrouter listening on http://127.0.0.1:${PORT}`)
);
