// Web UI password, from the host that holds the DB (for when it's forgotten):
//   npm run password -- reset   turns the login off; set a new one in Settings
// In Docker: ./delta.sh reset-password

try {
  process.loadEnvFile();
} catch {}

async function reset() {
  const [cmd] = process.argv.slice(2);
  if (cmd !== "reset") throw new Error("usage: password reset");
  const { clearLogin, getLogin } = await import("../lib/login-store");
  if (!getLogin()) {
    console.log("No password is set.");
    return;
  }
  clearLogin();
  console.log("Password removed. Delta is open again; set a new one in Settings → Password.");
}

reset().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
