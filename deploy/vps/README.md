# 8AM NY Live Bot VPS Deployment

This runs the 8AM NY Optimised strategy as an always-on Linux service.

## What This Does

- Runs `npm run eightam:live:trade`.
- Uses the live OANDA endpoint: `https://api-fxtrade.oanda.com`.
- Restarts automatically if the process crashes.
- Starts automatically after a VPS reboot.
- Keeps credentials outside the app folder in `/etc/fvg-scanner/eightam-live.env`.

## Minimum VPS

- Ubuntu 22.04 or 24.04.
- Node.js 22 LTS.
- At least 1 vCPU / 1 GB RAM.
- Stable internet connection.

## Install

Copy this project to the VPS, then run:

```bash
cd /path/to/fvg-scanner
sudo bash deploy/vps/install-eightam-live.sh
```

The first run creates:

```bash
/etc/fvg-scanner/eightam-live.env
```

Edit it:

```bash
sudo nano /etc/fvg-scanner/eightam-live.env
```

Set:

```bash
OANDA_LIVE_TOKEN=your_live_oanda_token
OANDA_LIVE_ACCOUNT_ID=your_live_account_id
OANDA_LIVE_CONFIRM=I_UNDERSTAND_LIVE_50_PERCENT_RISK
NODE_ENV=production
```

Then rerun:

```bash
sudo bash deploy/vps/install-eightam-live.sh
```

## Check Status

```bash
systemctl status eightam-live
journalctl -u eightam-live -f
tail -f /var/log/fvg-scanner/eightam-live.out.log
```

## Stop / Start / Restart

```bash
sudo systemctl stop eightam-live
sudo systemctl start eightam-live
sudo systemctl restart eightam-live
```

## Update Code

Copy the latest project files to the VPS, then rerun:

```bash
sudo bash deploy/vps/install-eightam-live.sh
```

## Important

This is live-account trading with 50% risk per signal. Keep the VPS secure:

- Do not commit `.env.local`.
- Do not store live credentials in Git.
- Use SSH keys, not password login.
- Enable automatic security updates.
