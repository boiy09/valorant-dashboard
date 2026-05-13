const http = require("http");
const { execFile } = require("child_process");
const path = require("path");
const crypto = require("crypto");

const SECRET = process.env.DEPLOY_SECRET;
const PORT = parseInt(process.env.DEPLOY_PORT || "9001", 10);
const DEPLOY_SCRIPT = path.join(__dirname, "deploy.sh");

if (!SECRET) {
  console.error("DEPLOY_SECRET environment variable is required.");
  process.exit(1);
}

let deploying = false;

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/deploy") {
    res.writeHead(404).end("Not found");
    return;
  }

  const token = req.headers["x-deploy-secret"];
  const tokenBuffer = Buffer.from(String(token || ""));
  const secretBuffer = Buffer.from(SECRET);

  if (tokenBuffer.length !== secretBuffer.length || !crypto.timingSafeEqual(tokenBuffer, secretBuffer)) {
    res.writeHead(401).end("Unauthorized");
    return;
  }

  if (deploying) {
    res.writeHead(409).end("Already deploying");
    return;
  }

  deploying = true;
  res.writeHead(202).end("Deploying...");
  console.log(`[${new Date().toISOString()}] deploy started`);

  execFile("bash", [DEPLOY_SCRIPT], { cwd: __dirname, env: { ...process.env } }, (err, stdout, stderr) => {
    deploying = false;
    if (err) {
      console.error(`[deploy failed]\n${stderr}`);
    } else {
      console.log(`[deploy done]\n${stdout}`);
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Deploy webhook listening on 127.0.0.1:${PORT}`);
});
