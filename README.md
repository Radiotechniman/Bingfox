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

- **Dashboard**: `http://localhost:3099` (the port is configured in `docker-compose.yml`).
- **Data**: Device data is persisted in `./bingfox/data/`.
- **Change Port**: Change `PORT` in the Compose environment section and recreate the container with `docker compose up -d --force-recreate`.
- The Dockerfile clones the GitHub repository while building. Push changes to GitHub before building if you want them included in the image.

## 🚀 Powered by Vibecode

This project was built with **Vibecode**, focusing on high performance and a modern, glassmorphic UI.

---
*Created for local network enthusiasts who want clarity and control over their connected devices.*
