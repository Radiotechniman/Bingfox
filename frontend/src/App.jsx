import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Network, Settings, Search, Edit2, RotateCcw, Trash2, Power, Clock, Download, ChevronRight, Laptop, Smartphone, Tv, HardDrive, Zap, Printer, Camera, Monitor, ShieldCheck, Activity } from 'lucide-react';
import './App.css';

function App() {
  const [devices, setDevices] = useState([]);
  const [settings, setSettings] = useState({ subnet: '', interval: '', web_ports: '80' });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'last_online_transition', direction: 'desc' });
  const [loading, setLoading] = useState(true);
  const [selectedDevices, setSelectedDevices] = useState(new Set());

  // Column filters state
  const [columnFilters, setColumnFilters] = useState({
    status: '',
    name: '',
    ip: '',
    mac: '',
    type: '',
    network_mode: '',
    first_seen: '',
    last_seen: ''
  });

  const handleColumnFilterChange = (key, value) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
  };

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [activeLogsDevice, setActiveLogsDevice] = useState(null);
  const [deviceLogs, setDeviceLogs] = useState([]);
  const [scanStatus, setScanStatus] = useState({ active: false, progress: 0 });
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'auto');
  const [isWindowMobile, setIsWindowMobile] = useState(window.innerWidth < 768);
  const isMobile = viewMode === 'mobile' || (viewMode === 'auto' && isWindowMobile);

  useEffect(() => {
    const handleResize = () => setIsWindowMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    const scanInterval = setInterval(fetchScanStatus, 2000);
    return () => {
      clearInterval(interval);
      clearInterval(scanInterval);
    };
  }, []);

  const fetchScanStatus = async () => {
    try {
      const res = await axios.get('/api/scan-status');
      setScanStatus(res.data);
    } catch (err) {
      console.error('Error fetching scan status:', err);
    }
  };

  const fetchData = async () => {
    try {
      const [devRes, setRes] = await Promise.all([
        axios.get('/api/devices'),
        axios.get('/api/settings')
      ]);
      setDevices(devRes.data);
      setSettings(setRes.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      setLoading(false);
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedAndFilteredDevices = useMemo(() => {
    let result = devices.filter(d => 
      (d.name && d.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.ip && d.ip.includes(searchQuery)) ||
      (d.mac && d.mac.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.type && d.type.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Apply column filters
    result = result.filter(d => {
      const s = (d.is_active ? 'online' : 'offline');
      const matchStatus = columnFilters.status === '' || s.includes(columnFilters.status.toLowerCase());
      const matchName = columnFilters.name === '' || (d.name && d.name.toLowerCase().includes(columnFilters.name.toLowerCase()));
      const matchIp = columnFilters.ip === '' || (d.ip && d.ip.toLowerCase().includes(columnFilters.ip.toLowerCase()));
      const matchMac = columnFilters.mac === '' || (d.mac && d.mac.toLowerCase().includes(columnFilters.mac.toLowerCase()));
      const matchType = columnFilters.type === '' || (d.type && d.type.toLowerCase().includes(columnFilters.type.toLowerCase()));
      const matchNetworkMode = columnFilters.network_mode === '' || (d.network_mode && d.network_mode.toLowerCase().includes(columnFilters.network_mode.toLowerCase()));

      const formatDt = (ts) => !ts ? 'never' : new Date(ts).toLocaleString().toLowerCase();
      const matchFirstSeen = columnFilters.first_seen === '' || formatDt(d.first_seen).includes(columnFilters.first_seen.toLowerCase());
      const matchLastSeen = columnFilters.last_seen === '' || formatDt(d.last_seen).includes(columnFilters.last_seen.toLowerCase());

      return matchStatus && matchName && matchIp && matchMac && matchType && matchNetworkMode && matchFirstSeen && matchLastSeen;
    });

    const compareIps = (ip1, ip2) => {
      const p1 = ip1.split('.').map(n => parseInt(n, 10).toString().padStart(3, '0')).join('.');
      const p2 = ip2.split('.').map(n => parseInt(n, 10).toString().padStart(3, '0')).join('.');
      return p1.localeCompare(p2);
    };

    result.sort((a, b) => {
      let key = sortConfig.key;
      let aVal = a[key];
      let bVal = b[key];
      
      // Special handling for IP column to use visible IP (Main IP preference)
      if (key === 'ip') {
        aVal = a.main_ip || a.ip;
        bVal = b.main_ip || b.ip;
        const cmp = compareIps(aVal || '0.0.0.0', bVal || '0.0.0.0');
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [devices, searchQuery, sortConfig, columnFilters]);

  const handleBulkDelete = async () => {
    if (selectedDevices.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedDevices.size} selected devices?`)) return;
    
    try {
      await axios.post('/api/devices/delete', { macs: Array.from(selectedDevices) });
      setSelectedDevices(new Set());
      fetchData();
    } catch (err) {
      console.error('Error deleting devices', err);
      alert('Failed to delete devices');
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newSettings = {
      subnet: formData.get('subnet'),
      interval: formData.get('interval'),
      web_ports: formData.get('web_ports')
    };
    try {
      await axios.put('/api/settings', newSettings);
      setSettings(newSettings);
      setIsSettingsOpen(false);
    } catch (err) {
      console.error('Error saving settings', err);
    }
  };

  const saveDevice = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updateData = {
      name: formData.get('name'),
      type: formData.get('type'),
      network_mode: formData.get('network_mode'),
      custom_port: formData.get('custom_port') ? parseInt(formData.get('custom_port'), 10) : null,
      main_ip: formData.get('main_ip')
    };
    try {
      await axios.put(`/api/devices/${editingDevice.mac}`, updateData);
      setEditingDevice(null);
      fetchData(); // refresh list
    } catch (err) {
      console.error('Error saving device', err);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const timeSince = (timestamp) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
  };

  const getDeviceIcon = (device) => {
    const type = (device.type || '').toLowerCase();
    const name = (device.name || '').toLowerCase();
    if (type.includes('phone') || type.includes('mobile') || name.includes('iphone') || name.includes('android')) return <Smartphone size={18} />;
    if (type.includes('laptop') || type.includes('pc') || type.includes('computer')) return <Laptop size={18} />;
    if (type.includes('tv')) return <Tv size={18} />;
    if (type.includes('server') || type.includes('nas')) return <HardDrive size={18} />;
    if (type.includes('iot') || type.includes('light') || type.includes('bulb') || type.includes('switch')) return <Zap size={18} />;
    if (type.includes('printer')) return <Printer size={18} />;
    if (type.includes('camera') || type.includes('cam')) return <Camera size={18} />;
    return <Monitor size={18} />;
  };

  const triggerScan = async () => {
    try {
      await axios.post('/api/scan');
      fetchScanStatus();
    } catch (err) {
      console.error('Error triggering scan', err);
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'IP', 'MAC', 'Vendor', 'Type', 'Status', 'Last Seen'];
    const rows = sortedAndFilteredDevices.map(d => [
      d.name || 'Unknown',
      d.main_ip || d.ip,
      d.mac,
      d.vendor || 'Unknown',
      d.type || '-',
      d.is_active ? 'Online' : 'Offline',
      formatDate(d.last_seen)
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...rows].map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bingfox_devices_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const wakeDevice = async (mac) => {
    try {
      await axios.post(`/api/devices/${mac}/wake`);
      alert('Wake-on-LAN packet sent!');
    } catch (err) {
      alert('Failed to send WoL packet');
    }
  };

  const showLogs = async (device) => {
    try {
      const res = await axios.get(`/api/devices/${device.mac}/logs`);
      setDeviceLogs(res.data);
      setActiveLogsDevice(device);
    } catch (err) {
      console.error('Error fetching logs', err);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.png" alt="Bingfox Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          Bingfox
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={`btn ${scanStatus.active ? 'btn-scanning' : ''}`} onClick={triggerScan} disabled={scanStatus.active} title="Scan Now">
              <Activity size={18} className={scanStatus.active ? 'spin' : ''} /> {!isMobile && (scanStatus.active ? `Scanning... ${scanStatus.progress}%` : 'Scan Now')}
            </button>
            <button className="btn" onClick={() => fetchData()} title="Refresh">
              <RotateCcw size={18} /> {!isMobile && 'Refresh'}
            </button>
            <button className="btn" onClick={() => setIsSettingsOpen(true)} title="Settings">
              <Settings size={18} /> {!isMobile && 'Settings'}
            </button>
          </div>
          {scanStatus.active && (
            <div style={{ width: '200px', background: 'rgba(255,255,255,0.1)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${scanStatus.progress}%`, 
                  height: '100%', 
                  background: 'var(--accent)', 
                  transition: 'width 0.5s ease' 
                }} 
              />
            </div>
          )}
        </div>
      </header>

      <div className="glass-panel">
        <div className="controls-bar">
          <div className="search-wrapper">
            <Search className="search-icon" size={18} />
            <input 
              type="text" 
              className="search-input form-control" 
              placeholder="Search devices..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '15px'}}>
            <span>{devices.filter(d => d.is_active).length} / {devices.length} online</span>
            <button className="btn btn-sm" onClick={exportCSV} title="Export to CSV">
              <Download size={16} /> Export
            </button>
            {selectedDevices.size > 0 && (
              <button className="btn" onClick={handleBulkDelete} style={{backgroundColor: '#da3633', color: 'white', border: 'none', display: 'flex', alignItems: 'center'}}>
                <Trash2 size={16} style={{marginRight: '6px'}} /> Delete ({selectedDevices.size})
              </button>
            )}
          </div>
        </div>

        <div className="glass-table-container">
          {loading ? (
            <div style={{textAlign: 'center', padding: '40px'}}>Loading dashboard...</div>
          ) : isMobile ? (
            <div className="mobile-cards">
              {sortedAndFilteredDevices.map(device => (
                <div key={device.mac} className="device-card glass-panel">
                  <div className="card-header">
                    <div className={`status-indicator ${device.missed_pings === 0 ? 'status-active' : (device.missed_pings <= 5 ? 'status-warning' : 'status-inactive')}`}></div>
                    <span className="card-name">{device.name || 'Unknown Device'}</span>
                    <button className="close-btn" onClick={() => setEditingDevice(device)}><Edit2 size={16} /></button>
                  </div>
                  <div className="card-body">
                    <div className="card-row"><span>IP:</span> <strong>{device.main_ip || device.ip}</strong></div>
                    {device.all_ips && device.all_ips.length > 1 && (
                      <div className="card-row" style={{fontSize: '0.7rem', marginTop: '-4px'}}>
                        <span>Alt IPs:</span>
                        <div style={{display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                          {device.all_ips.filter(ip => ip !== (device.main_ip || device.ip)).map(ip => (
                            <span key={ip} style={{color: 'var(--text-secondary)'}}>{ip}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="card-row"><span>MAC:</span> <span className="mono">{device.mac}</span></div>
                    <div className="card-row"><span>Vendor:</span> <span>{device.vendor || 'Unknown'}</span></div>
                    <div className="card-row"><span>Type:</span> <span>{device.type || '-'}</span></div>
                    <div className="card-row">
                      <span>Activity:</span> 
                      <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                        {timeSince(device.last_online_transition)}
                        {(Date.now() - (device.last_online_transition || 0)) < 600000 && device.is_active === 1 && (
                          <span style={{color: 'var(--success)', fontWeight: 'bold', fontSize: '0.7rem'}}>● NEW</span>
                        )}
                      </span>
                    </div>
                    <div className="card-row"><span>Mode:</span> <span className="badge">{device.network_mode || 'DHCP'}</span></div>
                  </div>
                  <div className="card-actions">
                    <button className="btn btn-sm" onClick={() => showLogs(device)}><Clock size={14} /> History</button>
                    {!device.is_active && (
                       <button className="btn btn-sm" onClick={() => wakeDevice(device.mac)}><Power size={14} /> Wake</button>
                    )}
                    {device.has_web > 0 && (
                      <a href={`http://${device.main_ip || device.ip}`} target="_blank" rel="noreferrer" className="btn btn-sm btn-primary">Open UI</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{width: '40px'}}>
                    <input 
                      type="checkbox" 
                      title="Select all filtered devices"
                      checked={sortedAndFilteredDevices.length > 0 && sortedAndFilteredDevices.every(d => selectedDevices.has(d.mac))}
                      onChange={(e) => {
                        const newSet = new Set(selectedDevices);
                        if (e.target.checked) {
                          sortedAndFilteredDevices.forEach(d => newSet.add(d.mac));
                        } else {
                          sortedAndFilteredDevices.forEach(d => newSet.delete(d.mac));
                        }
                        setSelectedDevices(newSet);
                      }}
                    />
                  </th>
                  <th onClick={() => handleSort('is_active')}>Status</th>
                  <th onClick={() => handleSort('name')}>Name</th>
                  <th onClick={() => handleSort('ip')}>IP Address</th>
                  <th onClick={() => handleSort('mac')}>MAC Address</th>
                  <th onClick={() => handleSort('type')}>Type</th>
                  <th onClick={() => handleSort('network_mode')}>Network Mode</th>
                  <th onClick={() => handleSort('last_online_transition')}>Activity</th>
                  <th onClick={() => handleSort('last_seen')}>Last Seen</th>
                  <th>Actions</th>
                </tr>
                <tr className="filter-row">
                  <td></td>
                  <td>
                    <select 
                      className="filter-input" 
                      value={columnFilters.status} 
                      onChange={(e) => handleColumnFilterChange('status', e.target.value)}
                    >
                      <option value="">All</option>
                      <option value="online">Online</option>
                      <option value="offline">Offline</option>
                    </select>
                  </td>
                  <td>
                    <input 
                      type="text" 
                      placeholder="Filter..." 
                      className="filter-input" 
                      value={columnFilters.name} 
                      onChange={(e) => handleColumnFilterChange('name', e.target.value)}
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      placeholder="Filter..." 
                      className="filter-input" 
                      value={columnFilters.ip} 
                      onChange={(e) => handleColumnFilterChange('ip', e.target.value)}
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      placeholder="Filter..." 
                      className="filter-input" 
                      value={columnFilters.mac} 
                      onChange={(e) => handleColumnFilterChange('mac', e.target.value)}
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      placeholder="Filter..." 
                      className="filter-input" 
                      value={columnFilters.type} 
                      onChange={(e) => handleColumnFilterChange('type', e.target.value)}
                    />
                  </td>
                  <td>
                    <select 
                      className="filter-input" 
                      value={columnFilters.network_mode} 
                      onChange={(e) => handleColumnFilterChange('network_mode', e.target.value)}
                    >
                      <option value="">All</option>
                      <option value="DHCP">DHCP</option>
                      <option value="Static-Router">Static (Router)</option>
                      <option value="Static-Client">Static (Client)</option>
                    </select>
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredDevices.map(device => (
                  <tr key={device.mac}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedDevices.has(device.mac)}
                        onChange={(e) => {
                          const newSet = new Set(selectedDevices);
                          if (e.target.checked) newSet.add(device.mac);
                          else newSet.delete(device.mac);
                          setSelectedDevices(newSet);
                        }}
                      />
                    </td>
                    <td>
                      {(() => {
                        let statusClass = 'status-inactive';
                        let statusLabel = 'Offline';
                        const missed = device.missed_pings || 0;

                        if (missed === 0) {
                          statusClass = 'status-active';
                          statusLabel = 'Online';
                        } else if (missed <= 5) {
                          statusClass = 'status-warning';
                          statusLabel = `Unstable`;
                        } else {
                          statusLabel = `Offline`;
                        }

                        return (
                          <div style={{display: 'flex', justifyContent: 'center'}}>
                            <span className={`status-indicator ${statusClass}`} title={`${statusLabel} (${missed} missed)`}></span>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{fontWeight: 600}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <span style={{color: 'var(--text-secondary)'}}>{getDeviceIcon(device)}</span>
                        {device.name || <span style={{color: 'var(--text-secondary)'}}>Unknown</span>}
                      </div>
                    </td>
                    <td style={{fontFamily: 'monospace'}}>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                          {(() => {
                            const displayIp = device.main_ip || device.ip;
                            const port = device.custom_port || device.has_web;
                            if (port) {
                              return (
                                <a href={`${port === 443 ? 'https' : 'http'}://${displayIp}${ (port === 80 || port === 443) ? '' : `:${port}` }`} target="_blank" rel="noreferrer" style={{color: '#58a6ff', textDecoration: 'none', fontWeight: 'bold'}} title={`Open Web Interface (Port ${port})`}>
                                  {displayIp}
                                </a>
                              );
                            }
                            return <span>{displayIp}</span>;
                          })()}
                          {device.main_ip && <span style={{fontSize: '0.7rem', color: 'var(--success)'}} title="Main IP">★</span>}
                        </div>
                        {device.all_ips && device.all_ips.length > 1 && (
                          <div style={{fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px'}}>
                            {device.all_ips.filter(ip => ip !== (device.main_ip || device.ip)).map(ip => (
                              <span key={ip} style={{background: 'rgba(255,255,255,0.05)', padding: '0 4px', borderRadius: '4px'}}>{ip}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.85rem'}}>{device.mac}</td>
                    <td>{device.type || '-'}</td>
                    <td>
                      <span className={`badge ${device.network_mode === 'DHCP' ? 'badge-dhcp' : 'badge-static'}`}>
                        {device.network_mode || 'DHCP'}
                      </span>
                    </td>
                    <td style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '6px'}} title={formatDate(device.last_online_transition)}>
                        {timeSince(device.last_online_transition)}
                        {(() => {
                          const diff = Date.now() - (device.last_online_transition || 0);
                          const isRecent = diff < 10 * 60 * 1000; // 10 mins
                          if (isRecent && device.is_active === 1) {
                            return <span style={{background: 'var(--success)', color: 'white', fontSize: '0.6rem', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>NEW</span>;
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}} title={formatDate(device.last_seen)}>
                      {timeSince(device.last_seen)}
                    </td>

                    <td>
                      <div className="td-actions">
                        <button className="action-btn" onClick={() => setEditingDevice(device)} title="Edit"><Edit2 size={16} /></button>
                        <button className="action-btn" onClick={() => showLogs(device)} title="History"><Clock size={16} /></button>
                        {!device.is_active && (
                          <button className="action-btn" onClick={() => wakeDevice(device.mac)} title="Wake on LAN"><Power size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2>Scanner Settings</h2>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>
            <form onSubmit={saveSettings}>
              <div className="form-group">
                <label>Subnet Base (e.g. 192.168.1)</label>
                <input 
                  type="text" 
                  name="subnet" 
                  className="form-control" 
                  defaultValue={settings.subnet} 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Scan Interval (Seconds)</label>
                <input 
                  type="number" 
                  name="interval" 
                  className="form-control" 
                  defaultValue={settings.interval} 
                  min="1" 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Web Interface Ports (comma separated)</label>
                <input 
                  type="text" 
                  name="web_ports" 
                  className="form-control" 
                  defaultValue={settings.web_ports || '80'} 
                  placeholder="e.g. 80, 443, 8080"
                />
              </div>
              <div className="form-group">
                <label>Layout Mode</label>
                <select 
                   className="form-control" 
                   value={viewMode} 
                   onChange={(e) => {
                     setViewMode(e.target.value);
                     localStorage.setItem('viewMode', e.target.value);
                   }}
                >
                  <option value="auto">Automatic (Base on screen size)</option>
                  <option value="mobile">Force Mobile (Cards)</option>
                  <option value="desktop">Force Desktop (Table)</option>
                </select>
                <p style={{fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px'}}>
                  Override how the dashboard looks on this device.
                </p>
              </div>
              <div className="modal-actions" style={{justifyContent: 'space-between'}}>
                <button type="button" className="btn" onClick={() => setIsAboutOpen(true)}>About</button>
                <div style={{display: 'flex', gap: '8px'}}>
                  <button type="button" className="btn" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Settings</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* About Modal */}
      {isAboutOpen && (
        <div className="modal-overlay" style={{zIndex: 1001}}>
          <div className="glass-panel modal-content" style={{textAlign: 'center', padding: '40px'}}>
            <div className="modal-header" style={{borderBottom: 'none'}}>
              <h2 style={{width: '100%'}}>About</h2>
              <button className="close-btn" onClick={() => setIsAboutOpen(false)} style={{position: 'absolute', right: '20px', top: '20px'}}>×</button>
            </div>
            <img src="/logo.png" alt="Bingfox Logo" style={{ width: '64px', height: '64px', margin: '20px auto', display: 'block', objectFit: 'contain' }} />
            <h3 style={{marginBottom: '10px'}}>Bingfox</h3>
            <p style={{color: 'var(--text-secondary)', marginBottom: '30px'}}>Version 0.2</p>
            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '30px'}}>
              Local network monitoring application.
            </p>
            <button className="btn btn-primary" onClick={() => setIsAboutOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Edit Device Modal */}
      {editingDevice && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2>Edit Device</h2>
              <button className="close-btn" onClick={() => setEditingDevice(null)}>×</button>
            </div>
            <form onSubmit={saveDevice}>
              <div className="form-group" style={{marginBottom: '20px'}}>
                <div style={{color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '4px'}}>Device Info:</div>
                <div style={{fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                   <div><strong>IP:</strong> {editingDevice.ip}</div>
                   <div><strong>MAC:</strong> {editingDevice.mac}</div>
                   <div><strong>Vendor:</strong> {editingDevice.vendor || 'Unknown'}</div>
                   <div style={{marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                      <div><strong>First Seen:</strong> {formatDate(editingDevice.first_seen)}</div>
                      <div><strong>Last Seen:</strong> {formatDate(editingDevice.last_seen)}</div>
                   </div>
                </div>
              </div>
              <div className="form-group">
                <label>Device Name</label>
                <input 
                  type="text" 
                  name="name" 
                  className="form-control" 
                  defaultValue={editingDevice.name || ''} 
                  placeholder="e.g. Living Room TV"
                />
              </div>
              <div className="form-group">
                <label>Device Type</label>
                <input 
                  type="text" 
                  name="type" 
                  className="form-control" 
                  defaultValue={editingDevice.type || ''} 
                  placeholder="e.g. Mobile, Server, IoT"
                />
              </div>
              <div className="form-group">
                <label>Main IP Address</label>
                <select name="main_ip" className="form-control" defaultValue={editingDevice.main_ip || editingDevice.ip}>
                  {editingDevice.all_ips && editingDevice.all_ips.length > 0 ? (
                    editingDevice.all_ips.map(ip => (
                      <option key={ip} value={ip}>{ip}</option>
                    ))
                  ) : (
                    <option value={editingDevice.ip}>{editingDevice.ip}</option>
                  )}
                </select>
                <p style={{fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px'}}>
                  Used for links and dashboard display.
                </p>
              </div>
              <div className="form-group">
                <label>Network Mode</label>
                <select 
                  name="network_mode" 
                  className="form-control" 
                  defaultValue={editingDevice.network_mode || 'DHCP'}
                >
                  <option value="DHCP">DHCP</option>
                  <option value="Static-Router">Static (Fixed by router)</option>
                  <option value="Static-Client">Static (Fixed by client)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Custom Web Interface Port</label>
                <input 
                  type="number" 
                  name="custom_port" 
                  className="form-control" 
                  defaultValue={editingDevice.custom_port || ''} 
                  placeholder="e.g. 8123 (Leave empty for auto-detect)"
                  min="1"
                  max="65535"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setEditingDevice(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* History Logs Modal */}
      {activeLogsDevice && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2>History: {activeLogsDevice.name || activeLogsDevice.ip}</h2>
              <button className="close-btn" onClick={() => setActiveLogsDevice(null)}>×</button>
            </div>
            <div style={{maxHeight: '400px', overflowY: 'auto', padding: '10px'}}>
              {deviceLogs.length === 0 ? (
                <p style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No history yet.</p>
              ) : (
                <div className="log-list">
                  {deviceLogs.map(log => (
                    <div key={log.id} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <span className={`status-indicator ${log.status === 'online' ? 'status-active' : 'status-inactive'}`}></span>
                        <span style={{textTransform: 'capitalize'}}>{log.status}</span>
                      </div>
                      <span style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>{formatDate(log.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setActiveLogsDevice(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Mobile Sorting Bar */}
      {isMobile && (
        <div className="mobile-sorter">
          <div className="sorter-label">Sort by:</div>
          <div className="sorter-buttons">
            <button 
              className={`sorter-btn ${sortConfig.key === 'is_active' ? 'active' : ''}`} 
              onClick={() => handleSort('is_active')}
            >
              <Activity size={16} /> Status
            </button>
            <button 
              className={`sorter-btn ${sortConfig.key === 'name' ? 'active' : ''}`} 
              onClick={() => handleSort('name')}
            >
              <Search size={16} /> Name
            </button>
            <button 
              className={`sorter-btn ${sortConfig.key === 'ip' ? 'active' : ''}`} 
              onClick={() => handleSort('ip')}
            >
              <Network size={16} /> IP
            </button>
            <button 
              className={`sorter-btn ${sortConfig.key === 'last_online_transition' ? 'active' : ''}`} 
              onClick={() => handleSort('last_online_transition')}
            >
              <Clock size={16} /> Activity
            </button>
          </div>
        </div>
      )}
    </div>
  );

}

export default App;
