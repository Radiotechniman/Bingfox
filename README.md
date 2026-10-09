# Bingfox - Network Monitoring Dashboard

Bingfox is a lightweight, real-time network scanner and monitoring tool designed to keep track of devices on your local network with a premium, responsive interface.

## 🚀 Key Features

- **Smart Scanning**: Combined Ping and ARP scanning for accurate device discovery.
- **Manufacturer Lookup**: Auto-identify devices (Apple, Samsung, Google, etc.) via OUI lookup.
- **Activity Tracking**: Sort by "Latest Event" to instantly see devices that just joined the network.
- **Wake on LAN (WoL)**: Send magic packets to wake up offline devices.
- **Status History**: Track online/offline transitions with a detailed history log for every device.
- **Mobile Responsive**: Seamless transition between a detailed Desktop table and a touch-friendly Mobile card view.
- **Data Export**: Export your entire device list to CSV with one click.
- **Custom Configuration**: Assign names, types, and custom web interface ports to your devices.

---

## 🛠️ Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v14 or higher)

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone <repository-url>
cd bingfox
npm install
```

### 3. Usage
You can run the server in the foreground:
```bash
node server.js
```

Or run it as a **daemon** in the background using the included script:
```bash
# Make it executable (one-time)
chmod +x start_bingfox_daemon.sh

# Start the daemon
./start_bingfox_daemon.sh
```

- **Logs**: Check `bingfox.log` for status updates.
- **Stop**: Use `pkill -f server.js` or the PID provided by the script.

### 4. Run with Docker (Work in progress)
This is the easiest way to deploy Bingfox persistently. 

> [!IMPORTANT]
> To allow the scanner to access your local network, **`network_mode: host`** is used in the configuration. This ensures the container can see your host's subnet and ARP table.

```bash
# Build the image and start/recreate the container
docker build -t bingfox .
docker compose up -d --force-recreate
```

```yaml
services:
  bingfox:
    image: bingfox
    container_name: bingfox
    network_mode: host
    healthcheck: # this is optional
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3099/api/devices').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s    
    cap_add:
      - NET_ADMIN
      - NET_RAW
    environment:
      - PORT=3099 # 
    volumes:
      - ./bingfox/data/:/app/data/
    restart: unless-stopped 
```


- **Dashboard**: `http://localhost:3099` (the port is configured in `docker-compose.yml`).
- **Data**: Device data is persisted in `./bingfox/data/`.
- **Change Port**: Change `PORT` in the Compose environment section and recreate the container with `docker compose up -d --force-recreate`.
- The Dockerfile clones the GitHub repository while building. Push changes to GitHub before building if you want them included in the image.
- **Device notifications**: Edit a device to configure optional connected/disconnected HTTP(S) GET URLs. URLs can use `{name}`, `{ip}`, `{mac}`, and `{status}` placeholders. The disconnect delay is in minutes; `0` sends as soon as Bingfox marks the device offline. Apprise API POST endpoints are not supported by this GET-only feature.

The CPU usage seems to be okay-ish with 12-15% during a run and 65mb of ram use. Comming from NetAllertX with a 1.5GB Ram use this looks to be better. 




## 🚀 Powered by Vibecode

This was build for personal use with AI to be used at home with limited "bad actors" there is no security so be carefull when roling this out. 
I'm not liable ..etc. etc. etc. 

This tool is free for personal use, but if money is to be made (directly or indirectly) I'd like a cut :-)
Contact me for details

---
*Created for local network enthusiasts who want clarity and control over their connected devices.*
