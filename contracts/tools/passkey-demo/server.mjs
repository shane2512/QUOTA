// Dev tool: serves the passkey page on http://localhost:3777 and saves posted assertions to disk.
// usage: node server.mjs <registry> <operator> <outDir>
import http from "node:http";
import fs from "node:fs";
const [registry, operator, outDir] = process.argv.slice(2);
const page = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8")
  .replace("__REGISTRY__", registry).replace("__OPERATOR__", operator);
http.createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/save/")) {
    const name = req.url.slice(6).replace(/[^a-z0-9_-]/gi, "");
    let b = ""; req.on("data", d => (b += d)).on("end", () => { fs.writeFileSync(`${outDir}/${name}.json`, b); res.end("ok"); });
  } else { res.setHeader("content-type", "text/html"); res.end(page); }
}).listen(3777, "127.0.0.1", () => console.log("http://localhost:3777"));
