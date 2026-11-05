# Homebrew formula for Delta. Lives in the tap repo zeapsu/homebrew-tap, so
# `brew install zeapsu/tap/delta` works; this copy in the Delta repo is the
# source (homebrew/README.md). The tap's bump workflow updates url and sha256
# to each new release.
class Delta < Formula
  desc "Self-hosted personal finance dashboard with an MCP server for your agent"
  homepage "https://zeapsu.github.io/Delta/"
  url "https://github.com/zeapsu/Delta/archive/refs/tags/v1.1.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "AGPL-3.0-only"

  # Delta's Docker image runs Node 24 too. A versioned Node keeps the SQLite
  # driver's native module working when Homebrew's `node` moves on.
  depends_on "node@24"

  def install
    node = Formula["node@24"].opt_bin
    ENV.prepend_path "PATH", node
    ENV["NEXT_TELEMETRY_DISABLED"] = "1"
    # The update notice compares this with the latest release.
    ENV["DELTA_COMMIT"] = "v#{version}"

    system "npm", "ci", "--no-audit", "--no-fund"
    system "npm", "run", "build"
    system "npm", "prune", "--omit=dev", "--no-audit", "--no-fund"
    rm_r ".next/cache"

    libexec.install Dir["*"], ".next"
    (bin/"delta").write <<~SH
      #!/bin/bash
      export DELTA_HOME="${DELTA_HOME:-#{var}/delta}"
      export DELTA_INSTALL=brew
      exec "#{node}/node" "#{libexec}/scripts/delta.mjs" "$@"
    SH
  end

  def post_install
    (var/"delta").mkpath
  end

  def caveats
    <<~EOS
      Start Delta and keep it running, also after a restart:
        brew services start delta
      Then open http://127.0.0.1:3000 and follow the steps.

      Your data is in #{var}/delta. More commands: delta help
      Before uninstalling, run `delta unlink` so Plaid stops billing for your banks.
    EOS
  end

  service do
    run [opt_bin/"delta", "start"]
    keep_alive true
    log_path var/"log/delta.log"
    error_log_path var/"log/delta.log"
  end

  test do
    port = free_port
    env = { "DELTA_HOME" => testpath.to_s, "PORT" => port.to_s, "DELTA_UPDATE_CHECK" => "off" }
    pid = spawn(env, bin/"delta", "start")
    begin
      body = nil
      30.times do
        sleep 2
        body = shell_output("curl -sf http://127.0.0.1:#{port}/ || true")
        break unless body.empty?
      end
      assert_match "Welcome to Delta", body
    ensure
      Process.kill("TERM", pid)
      Process.wait(pid)
    end
  end
end
