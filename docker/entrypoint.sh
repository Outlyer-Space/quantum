#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------
# 1️⃣  Start the SSH daemon (runs in the background)
# -----------------------------------------------------------------
if [[ ! -f /etc/ssh/ssh_host_rsa_key ]]; then
    echo "[entrypoint] Generating fresh SSH host keys ..."
    ssh-keygen -A
fi
/usr/sbin/sshd -D &
SSHD_PID=$!

# -----------------------------------------------------------------
# 2️⃣  Function that starts pm2 – you can add any flags you like
# -----------------------------------------------------------------
start_pm2() {
  echo "[$(date)] Starting pm2..."
  # pm2-runtime will keep the process in the foreground until it exits
  pm2-runtime start /node/pm2.config.js
  echo "[$(date)] pm2 exited with status $?"
}

# -----------------------------------------------------------------
# 3️⃣  Restart loop – sleeps a few seconds between attempts
# -----------------------------------------------------------------
while true; do
  start_pm2
  echo "[$(date)] Restarting pm2 in 5 seconds…"
  sleep 5
done &

# -----------------------------------------------------------------
# 4️⃣  Wait for the SSH daemon so the container doesn’t exit early.
# -----------------------------------------------------------------
wait $SSHD_PID
