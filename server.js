const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');
const ping = require('ping');
const path = require('path');
const net = require('net');
const wol = require('node-wol');

const execPromise = util.promisify(exec);

const app = express();
const db = new Database(path.join(__dirname, 'data.db'));

app.use(cors());
app.use(express.json());
// Serve frontend build if available
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Initialize DB schema
db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    mac TEXT PRIMARY KEY,
    ip TEXT,
    name TEXT,
    type TEXT,
    network_mode TEXT DEFAULT 'DHCP',
    first_seen INTEGER,
    last_seen INTEGER,
    is_active INTEGER DEFAULT 0,
    main_ip TEXT,
    missed_pings INTEGER DEFAULT 0,
    vendor TEXT,
    last_online_transition INTEGER
  );

  CREATE TABLE IF NOT EXISTS device_ips (
    mac TEXT,
    ip TEXT,
    last_seen INTEGER,
    PRIMARY KEY (mac, ip)
  );

  CREATE TABLE IF NOT EXISTS device_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac TEXT,
    status TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migrate schema updates
try { db.exec('ALTER TABLE devices ADD COLUMN has_web INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE devices ADD COLUMN custom_port INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE devices ADD COLUMN main_ip TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE devices ADD COLUMN missed_pings INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE devices ADD COLUMN vendor TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE devices ADD COLUMN last_online_transition INTEGER'); } catch (e) {}

// Migrate: set last_online_transition to last_seen for currently active devices if NULL
try {
  db.prepare("UPDATE devices SET last_online_transition = last_seen WHERE last_online_transition IS NULL AND is_active = 1").run();
} catch (e) {}

// Scan state for UI
let scanStatus = { active: false, progress: 0 };

// Curated Vendor List (Top OUIs)
const VENDOR_MAP = {
  '00:0c:29': 'VMware', '08:00:27': 'Oracle VirtualBox', '00:05:5d': 'D-Link',
  '00:50:56': 'VMware', '00:15:5d': 'Microsoft Hyper-V', '3c:7c:3f': 'Xiaomi',
  'b8:27:eb': 'Raspberry Pi Foundation', 'dc:a6:32': 'Raspberry Pi Foundation',
  'e4:5f:01': 'Raspberry Pi Foundation', '00:11:32': 'Synology', '00:1d:0f': 'TP-LINK',
  'a0:d3:c1': 'Samsung Electronics', '74:da:38': 'Realtek', 'fc:fb:fb': 'Amazon Technologies',
  'd8:07:b6': 'Apple', 'ac:bc:32': 'Apple', '90:32:4b': 'Apple', '48:d7:05': 'Apple',
  '34:af:b3': 'Google', 'cc:f4:11': 'Google', 'f4:f5:d8': 'Google', '74:e5:43': 'Google',
  '2c:f0:ee': 'Sony', '64:16:66': 'Sony', '00:1c:c0': 'HP', '00:25:b3': 'HP',
  '00:14:22': 'Dell', '00:15:c5': 'Dell', '74:86:7a': 'Dell', 'c4:ad:34': 'LG Electronics',
  'a8:66:7f': 'Apple', 'd4:61:9d': 'Apple', '40:9c:28': 'Apple', '38:c9:86': 'Apple', '5a:60:61': 'Apple',
  'c8:bd:69': 'Samsung', '4c:66:a6': 'Samsung', '40:de:24': 'Samsung', 'c8:d7:78': 'Samsung',
  '94:58:cb': 'Nintendo', '7c:87:ce': 'SwitchBot', '90:e8:68': 'Homey (Athom)', 'c4:8b:66': 'Reolink',
  '44:bb:3b': 'Heiman', '44:3e:07': 'Samsung', '94:b9:7e': 'Mila (Xiaomi/Other?)'
};

function getVendor(mac) {
  if (!mac) return 'Unknown';
  const prefix = mac.toLowerCase().substring(0, 8);
  return VENDOR_MAP[prefix] || 'Unknown';
}

// One-off migration to update vendors for existing devices
try {
  const devices = db.prepare('SELECT mac FROM devices').all();
  const updateVendor = db.prepare('UPDATE devices SET vendor = ? WHERE mac = ?');
  devices.forEach(d => {
    updateVendor.run(getVendor(d.mac), d.mac);
  });
  console.log(`[Database] Updated vendor info for ${devices.length} existing devices.`);
} catch (e) {
  console.error('[Database] Error migrating vendors:', e.message);
}

// Migrate old Dutch values to English values
try {
  db.exec("UPDATE devices SET network_mode = 'Static-Router' WHERE network_mode = 'Vast-Router'");
  db.exec("UPDATE devices SET network_mode = 'Static-Client' WHERE network_mode = 'Vast-client'");
} catch (e) {}

// Insert default settings if they don't exist
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('subnet', '192.168.1');
insertSetting.run('interval', '30');
insertSetting.run('web_ports', '80');

// API Routes
app.get('/api/devices', (req, res) => {
  const devices = db.prepare(`
    SELECT d.*, 
           (SELECT group_concat(ip) FROM device_ips WHERE mac = d.mac) as all_ips
    FROM devices d 
    ORDER BY is_active DESC, last_seen DESC
  `).all();
  
  // Convert comma-separated string to array
  devices.forEach(d => {
    d.all_ips = d.all_ips ? d.all_ips.split(',') : [];
  });
  
  res.json(devices);
});

app.put('/api/devices/:mac', (req, res) => {
  const { mac } = req.params;
  const { name, type, network_mode, custom_port, main_ip } = req.body;
  const stmt = db.prepare(`
    UPDATE devices 
    SET name = ?, type = ?, network_mode = ?, custom_port = ?, main_ip = ? 
    WHERE mac = ?
  `);
  stmt.run(name || '', type || '', network_mode || 'DHCP', custom_port || null, main_ip || null, mac);
  res.json({ success: true });
});

app.post('/api/devices/delete', (req, res) => {
  const { macs } = req.body;
  if (!Array.isArray(macs)) return res.status(400).json({ error: 'Invalid data' });
  const deleteStmt = db.prepare('DELETE FROM devices WHERE mac = ?');
  const deleteLogsStmt = db.prepare('DELETE FROM device_logs WHERE mac = ?');
  const deleteIpsStmt = db.prepare('DELETE FROM device_ips WHERE mac = ?');
  const deleteTx = db.transaction((macsList) => {
    for (const m of macsList) {
      deleteStmt.run(m);
      deleteLogsStmt.run(m);
      deleteIpsStmt.run(m);
    }
  });
  try {
    deleteTx(macs);
    res.json({ success: true, count: macs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scan-status', (req, res) => {
  res.json(scanStatus);
});

app.post('/api/devices/:mac/wake', (req, res) => {
  const { mac } = req.params;
  wol.wake(mac, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/scan', (req, res) => {
  if (scanStatus.active) return res.status(400).json({ error: 'Scan already in progress' });
  scanNetwork(); // kicks off in background
  res.json({ success: true });
});


app.get('/api/devices/:mac/logs', (req, res) => {
  const { mac } = req.params;
  const logs = db.prepare('SELECT * FROM device_logs WHERE mac = ? ORDER BY timestamp DESC LIMIT 50').all(mac);
  res.json(logs);
});

app.get('/api/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  const settingsObj = {};
  settings.forEach(s => settingsObj[s.key] = s.value);
  res.json(settingsObj);
});

app.put('/api/settings', (req, res) => {
  const { subnet, interval, web_ports } = req.body;
  const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  if (subnet) stmt.run(subnet, 'subnet');
  if (web_ports) stmt.run(web_ports.toString(), 'web_ports');
  if (interval) {
    stmt.run(interval.toString(), 'interval');
    startScanner(); // restart interval with new setting
  }
  res.json({ success: true });
});

// Quick port scanner
function checkPort(port, host, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// Network Scanner Logic
async function scanNetwork() {
  const settings = db.prepare('SELECT * FROM settings').all();
  const subnetSetting = settings.find(s => s.key === 'subnet')?.value || '192.168.1';
  
  console.log(`[Scanner] Starting scan for subnet ${subnetSetting}.1 - 254...`);
  scanStatus = { active: true, progress: 0 };

  const activeIpsSet = new Set();
  const CHUNK_SIZE = 50;
  
  for (let i = 1; i <= 254; i += CHUNK_SIZE) {
    const promises = [];
    const end = Math.min(i + CHUNK_SIZE - 1, 254);
    for (let j = i; j <= end; j++) {
      const ip = `${subnetSetting}.${j}`;
      promises.push(ping.promise.probe(ip, { timeout: 1 }));
    }
    const results = await Promise.all(promises);
    results.filter(r => r.alive).forEach(r => activeIpsSet.add(r.host));
    
    scanStatus.progress = Math.round((end / 254) * 80); // 80% for pinging
  }

  // Give ARP cache a small moment to populate after pings
  await new Promise(resolve => setTimeout(resolve, 500));

  let arpMap = {};
  try {
    const { stdout } = await execPromise('ip neigh');
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.includes('FAILED') || line.includes('INCOMPLETE')) continue;
      const match = line.match(/^(\d+\.\d+\.\d+\.\d+).*lladdr ([a-fA-F0-9:]+)/);
      if (match) {
        arpMap[match[1]] = match[2];
      }
    }
  } catch (err) {
    console.error('[Scanner] Error running ip neigh command:', err.message);
  }

  Object.keys(arpMap).forEach(ip => {
    if (ip.startsWith(`${subnetSetting}.`)) {
      activeIpsSet.add(ip);
    }
  });
  const activeIps = Array.from(activeIpsSet);

  console.log(`[Scanner] Found ${activeIps.length} total active devices (Ping + ARP). Scanning web ports...`);

  const portsStr = settings.find(s => s.key === 'web_ports')?.value || '80';
  const webPorts = portsStr.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);

  const webStatusMap = {};
  await Promise.all(activeIps.map(async (ip) => {
    const portChecks = await Promise.all(webPorts.map(p => checkPort(p, ip).then(res => res ? p : 0)));
    webStatusMap[ip] = portChecks.find(p => p > 0) || 0;
  }));
  
  scanStatus.progress = 100;

  try {
    const now = Date.now();
    
    // Increment missed pings for everyone at start of scan, but cap at 51
    db.prepare('UPDATE devices SET missed_pings = missed_pings + 1 WHERE missed_pings <= 50').run();
    
    // Log offline status for those crossing the 5-ping threshold
    const becameOffline = db.prepare('SELECT mac FROM devices WHERE missed_pings = 6 AND is_active = 1').all();
    becameOffline.forEach(d => {
      db.prepare('INSERT INTO device_logs (mac, status, timestamp) VALUES (?, ?, ?)').run(d.mac, 'offline', now);
    });

    // Only set to inactive if missed more than 5 times
    db.prepare('UPDATE devices SET is_active = 0 WHERE missed_pings > 5').run();

    const insertDevice = db.prepare(`
      INSERT INTO devices (mac, ip, first_seen, last_seen, is_active, has_web, missed_pings, vendor, last_online_transition) 
      VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?)
      ON CONFLICT(mac) DO UPDATE SET 
        ip = excluded.ip,
        last_seen = excluded.last_seen,
        is_active = 1,
        has_web = excluded.has_web,
        missed_pings = 0,
        vendor = excluded.vendor,
        last_online_transition = CASE WHEN devices.is_active = 0 THEN excluded.last_online_transition ELSE devices.last_online_transition END
    `);

    const logStatusChange = (mac, newStatus) => {
      const old = db.prepare('SELECT is_active FROM devices WHERE mac = ?').get(mac);
      const oldStatus = old ? (old.is_active ? 'online' : 'offline') : 'new';
      if (oldStatus !== newStatus) {
        db.prepare('INSERT INTO device_logs (mac, status, timestamp) VALUES (?, ?, ?)').run(mac, newStatus, now);
      }
    };

    const updateTx = db.transaction((ips) => {
      let count = 0;
      for (const ip of ips) {
        let mac = arpMap[ip];
        
        if (mac) {
          logStatusChange(mac, 'online');
          
          // If a real MAC is found, check if we have a placeholder record for this IP
          const placeholder = db.prepare('SELECT * FROM devices WHERE mac = ?').get(`unknown-${ip}`);
          
          // Insert/Update the peripheral IP record
          db.prepare('INSERT OR REPLACE INTO device_ips (mac, ip, last_seen) VALUES (?, ?, ?)').run(mac, ip, now);

          // Insert the real device first
          insertDevice.run(mac, ip, now, now, webStatusMap[ip] || 0, getVendor(mac), now);

          if (placeholder) {
            // Migrate any user-provided data from the placeholder to the real MAC record
            // but only if the real MAC record doesn't already have data.
            db.prepare(`
              UPDATE devices SET 
                name = CASE WHEN (name IS NULL OR name = '') THEN ? ELSE name END,
                type = CASE WHEN (type IS NULL OR type = '') THEN ? ELSE type END,
                network_mode = CASE WHEN (network_mode IS NULL OR network_mode = 'DHCP') THEN ? ELSE network_mode END,
                custom_port = COALESCE(custom_port, ?)
              WHERE mac = ?
            `).run(placeholder.name || '', placeholder.type || '', placeholder.network_mode || 'DHCP', placeholder.custom_port || null, mac);
            
            // Now safe to remove the placeholder
            db.prepare('DELETE FROM devices WHERE mac = ?').run(`unknown-${ip}`);
          }
        } else {
          // If no MAC is found in ARP, assign a placeholder MAC based on IP
          mac = `unknown-${ip}`;
          insertDevice.run(mac, ip, now, now, webStatusMap[ip] || 0, 'Unknown', now);
          // Also track in device_ips
          db.prepare('INSERT OR REPLACE INTO device_ips (mac, ip, last_seen) VALUES (?, ?, ?)').run(mac, ip, now);
        }
        count++;
      }
      return count;
    });

    const updatedCount = updateTx(activeIps);
    console.log(`[Scanner] Scan complete. Updated ${updatedCount} devices with MACs in database.`);
    scanStatus.active = false;
  } catch (err) {
    console.error('[Scanner] Error running scan:', err.message);
    scanStatus.active = false;
  }
}

// Start scanning loop
let scanInterval;
function startScanner() {
  if (scanInterval) clearInterval(scanInterval);
  const intervalSetting = db.prepare("SELECT value FROM settings WHERE key = 'interval'").get();
  const seconds = parseInt(intervalSetting?.value || '30', 10);
  console.log(`[Scanner] Scheduled to run every ${seconds} seconds.`);
  
  scanInterval = setInterval(scanNetwork, seconds * 1000);
  // Run first scan immediately without blocking initialization
  setTimeout(scanNetwork, 1000);
}

// Start initially
startScanner();

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Backend API running on http://0.0.0.0:${PORT}`);
});
