const http = require("http");
const { execFile } = require("child_process");
const path = require("path");
const crypto = require("crypto");

const SECRET = process.env.DEPLOY_SECRET;
const PORT = parseInt(process.env.DEPLOY_PORT || "9001", 10);
const DEPLOY_SCRIPT = path.join(__dirname, "deploy.sh");

if (!SECRET) {
  console.error("DEPLOY_SECRET 환경변수가 필요합니다.");
  process.exit(1);
}

let deploying = false;

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/deploy") {
    res.writeHead(404).end("Not found");
    return;
  }

  const token = req.headers["x-deploy-secret"];
  if (!token || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(SECRET))) {
    res.writeHead(401).end("Unauthorized");
    return;
  }

  if (deploying) {
    res.writeHead(409).end("Already deploying");
    return;
  }

  deploying = true;
  res.writeHead(202).end("Deploying...");
  console.log(`[${new Date().toISOString()}] 배포 시작`);

  execFile("bash", [DEPLOY_SCRIPT], { cwd: __dirname, env: { ...process.env } }, (err, stdout, stderr) => {
    deploying = false;
    if (err) {
      console.error(`[배포 실패]\n${stderr}`);
    } else {
      console.log(`[배포 완료]\n${stdout}`);
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Deploy webhook listening on 127.0.0.1:${PORT}`);
});
