import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const host = process.env.IRA_BRAIN_HOST || "0.0.0.0";
const port = Number(process.env.PORT || 10000);
const token = String(process.env.IRA_BRAIN_TOKEN || "").trim();
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
  res.writeHead(status, {"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
  res.end(json);
}

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, {ok:true,status:"online",message:"IRA Brain server online",model:{configured:false,testMode:true}});
  }
  if (!authorized(req)) return send(res, 401, {ok:false,error:"UNAUTHORIZED"});
  if (req.method === "POST" && req.url === "/v1/chat") {
    return send(res, 200, {
      ok:true,
      reply:"Ciao! IRA Brain è online e il collegamento Telegram → Cloudflare → Render funziona correttamente. Questa è una risposta di test: il modello AI vero non è ancora collegato.",
      test_mode:true,
      model_configured:false
    });
  }
  return send(res, 404, {ok:false,error:"NOT_FOUND"});
}).listen(port, host, () => console.log(`IRA Brain online on ${host}:${port}`));
