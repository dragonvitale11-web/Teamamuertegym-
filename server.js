import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const host = process.env.IRA_BRAIN_HOST || "0.0.0.0";
const port = Number(process.env.PORT || 10000);
const token = String(process.env.IRA_BRAIN_TOKEN || "").trim();
const groqApiKey = String(process.env.GROQ_API_KEY || "").trim();
const groqModel = String(process.env.GROQ_MODEL || "openai/gpt-oss-120b").trim();

if (!token) process.exit(1);

function authorized(req) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(auth.slice(7).trim());
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function extractMessage(body) {
  for (const key of ["message", "text", "prompt"]) {
    if (typeof body?.[key] === "string" && body[key].trim()) return body[key].trim();
  }

  if (Array.isArray(body?.messages)) {
    const lastUser = [...body.messages]
      .reverse()
      .find(item => item?.role === "user" && typeof item?.content === "string" && item.content.trim());
    if (lastUser) return lastUser.content.trim();
  }

  return "";
}

async function generateWithGroq(message) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${groqApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: groqModel,
      messages: [
        {
          role: "system",
          content: "Sei IRA, un assistente AI in fase di sviluppo. Rispondi in italiano in modo chiaro, diretto e utile. Per ora comportati come un normale assistente linguistico; le conoscenze fitness specialistiche, la memoria e gli strumenti verranno collegati separatamente."
        },
        { role: "user", content: message }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error("MODEL_REQUEST_FAILED");
    err.status = response.status;
    err.detail = data?.error?.message || null;
    throw err;
  }

  const reply = data?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) throw new Error("EMPTY_MODEL_RESPONSE");
  return reply.trim();
}

http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, {
      ok: true,
      status: "online",
      message: "IRA Brain server online",
      model: {
        configured: Boolean(groqApiKey),
        provider: groqApiKey ? "groq" : null,
        model: groqApiKey ? groqModel : null
      }
    });
  }

  if (!authorized(req)) return send(res, 401, { ok: false, error: "UNAUTHORIZED" });

  if (req.method === "POST" && req.url === "/v1/chat") {
    if (!groqApiKey) {
      return send(res, 503, {
        ok: false,
        error: "MODEL_NOT_CONFIGURED",
        message: "IRA Brain è online, ma il motore linguistico non è ancora configurato."
      });
    }

    try {
      const body = await readJson(req);
      const message = extractMessage(body);
      if (!message) return send(res, 400, { ok: false, error: "MESSAGE_REQUIRED" });

      const reply = await generateWithGroq(message);
      return send(res, 200, {
        ok: true,
        reply,
        provider: "groq",
        model: groqModel
      });
    } catch (error) {
      console.error("IRA Brain chat error", {
        message: error?.message,
        status: error?.status
      });
      return send(res, 502, {
        ok: false,
        error: "MODEL_ERROR",
        message: "Il motore linguistico non ha risposto correttamente."
      });
    }
  }

  return send(res, 404, { ok: false, error: "NOT_FOUND" });
}).listen(port, host, () => console.log(`IRA Brain online on ${host}:${port}`));
