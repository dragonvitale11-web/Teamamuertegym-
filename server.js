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
  if (!authorized(req)) return send(res, 401, {ok:false,error:"UNAUTHORIZED"});
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, {ok:true,status:"online",message:"IRA Brain server online",model:{configured:false}});
  }
  if (req.method === "POST" && req.url === "/v1/chat") {
    return send(res, 503, {ok:false,error:"MODEL_NOT_CONFIGURED",message:"Server IRA online; modello linguistico non ancora configurato."});
  }
  return send(res, 404, {ok:false,error:"NOT_FOUND"});
}).listen(port, host, () => console.log(`IRA Brain online on ${host}:${port}`));
