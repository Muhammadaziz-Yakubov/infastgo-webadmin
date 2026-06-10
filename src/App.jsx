import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Car,
  MapPin,
  Settings,
  Bell,
  LogOut,
  TrendingUp,
  Activity,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Send,
  Loader2,
  History,
  ChevronDown,
  ChevronUp,
  Phone,
  Clock,
  Route,
} from 'lucide-react';
import { api, setToken, getToken } from './services/api';
import { io } from 'socket.io-client';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  
  // Login flow states
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Main panel navigation
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, users, drivers, live, pricing, notifications

  // Data states
  const [stats, setStats] = useState({ totalUsers: 0, totalDrivers: 0, activeRides: 0, revenue: 0 });
  const [usersList, setUsersList] = useState([]);
  const [driversList, setDriversList] = useState([]);
  const [liveRides, setLiveRides] = useState([]);
  const [ridesList, setRidesList] = useState([]);
  const [expandedRide, setExpandedRide] = useState(null);
  const [pricing, setPricing] = useState({
    tariffs: {
      standart: { baseFare: 5000, pricePerKm: 1500 },
      komfort: { baseFare: 7000, pricePerKm: 2000 },
      biznes: { baseFare: 10000, pricePerKm: 3000 },
    },
    surgeMultiplier: 1.0,
  });

  // Creation/Action forms
  const [driverModal, setDriverModal] = useState(false);
  const [newDriver, setNewDriver] = useState({
    phone: '+99890',
    name: '',
    surname: '',
    carMake: 'Chevrolet',
    carModel: '',
    carColor: '',
    carPlate: '',
    tariffs: ['standart'],
  });

  // Push notifications form
  const [pushForm, setPushForm] = useState({
    recipientType: 'all',
    recipientId: '',
    title: '',
    body: '',
  });
  const [pushStatus, setPushStatus] = useState('');

  // Socket state for live updates
  const [socket, setSocket] = useState(null);

  // Mapbox Map state references
  const mapInstanceRef = React.useRef(null);
  const mapMarkersRef = React.useRef({});
  const routeLayersRef = React.useRef([]);

  const updateMapMarkersAndRoutes = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // --- Update Driver Markers ---
    const activeDriverIds = new Set();
    
    driversList.forEach((driver) => {
      if (driver.status === 'offline' || !driver.currentLocation) return;
      
      const { lat, lng } = driver.currentLocation;
      const driverId = driver._id;
      activeDriverIds.add(driverId);

      // Icon element
      let el = document.getElementById(`marker-driver-${driverId}`);
      if (!el) {
        el = document.createElement('div');
        el.id = `marker-driver-${driverId}`;
        el.style.fontSize = '24px';
        el.style.cursor = 'pointer';
        el.style.transition = 'all 1s ease';
        el.innerHTML = driver.status === 'busy' ? '🚖' : '🚕';
        
        // Add a tooltip/popup on hover/click
        const popup = new window.mapboxgl.Popup({ offset: 25 }).setHTML(
          `<div class="text-slate-900 font-sans p-1">
            <p class="font-bold text-sm">${driver.name} ${driver.surname}</p>
            <p class="text-xs text-slate-500">${driver.carInfo?.color} ${driver.carInfo?.make} (${driver.carInfo?.plateNumber})</p>
            <p class="text-[10px] uppercase font-bold mt-1 ${driver.status === 'busy' ? 'text-amber-600' : 'text-emerald-600'}">${driver.status}</p>
          </div>`
        );

        const marker = new window.mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        mapMarkersRef.current[driverId] = marker;
      } else {
        // Just update location
        mapMarkersRef.current[driverId].setLngLat([lng, lat]);
        el.innerHTML = driver.status === 'busy' ? '🚖' : '🚕';
      }
    });

    // Remove offline driver markers
    Object.keys(mapMarkersRef.current).forEach((driverId) => {
      if (!activeDriverIds.has(driverId)) {
        mapMarkersRef.current[driverId].remove();
        delete mapMarkersRef.current[driverId];
      }
    });

    // --- Update Routes / Ride Lines ---
    // Remove old route sources and layers
    routeLayersRef.current.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
    routeLayersRef.current = [];

    // Draw active rides
    liveRides.forEach((ride) => {
      if (!ride.pickup || !ride.destination) return;
      if (ride.status === 'completed' || ride.status === 'cancelled') return;

      const sourceId = `route-source-${ride._id}`;
      const layerId = `route-layer-${ride._id}`;
      
      routeLayersRef.current.push(layerId);

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [ride.pickup.lng, ride.pickup.lat],
                [ride.destination.lng, ride.destination.lat],
              ],
            },
          },
        });
      }

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#00E676', // Green line for the active route!
            'line-width': 3,
            'line-dasharray': [2, 2], // Dotted line style
          },
        });
      }

      // Add pickup A and dest B markers for active rides if not already added
      const pickupElId = `ride-pickup-${ride._id}`;
      let pEl = document.getElementById(pickupElId);
      if (!pEl) {
        pEl = document.createElement('div');
        pEl.id = pickupElId;
        pEl.innerHTML = '<span style="display: flex; align-items: center; justify-content: center; background-color: #10B981; color: #0f172a; font-weight: 800; font-size: 10px; width: 20px; height: 20px; border-radius: 9999px; border: 1px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">A</span>';
        new window.mapboxgl.Marker(pEl)
          .setLngLat([ride.pickup.lng, ride.pickup.lat])
          .addTo(map);
      }

      const destElId = `ride-dest-${ride._id}`;
      let dEl = document.getElementById(destElId);
      if (!dEl) {
        dEl = document.createElement('div');
        dEl.id = destElId;
        dEl.innerHTML = '<span style="display: flex; align-items: center; justify-content: center; background-color: #EF4444; color: white; font-weight: 800; font-size: 10px; width: 20px; height: 20px; border-radius: 9999px; border: 1px solid white; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">B</span>';
        new window.mapboxgl.Marker(dEl)
          .setLngLat([ride.destination.lng, ride.destination.lat])
          .addTo(map);
      }
    });
  };

  // Initialize Mapbox map
  useEffect(() => {
    if (activeTab !== 'live') {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      mapMarkersRef.current = {};
      routeLayersRef.current = [];
      return;
    }

    if (!window.mapboxgl) {
      console.error('Mapbox GL library not loaded yet');
      return;
    }

    window.mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
    
    const map = new window.mapboxgl.Map({
      container: 'mapbox-admin-map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [69.240562, 41.311081], // Tashkent center
      zoom: 12,
    });

    mapInstanceRef.current = map;

    map.on('load', () => {
      updateMapMarkersAndRoutes();
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      mapMarkersRef.current = {};
      routeLayersRef.current = [];
    };
  }, [activeTab]);

  // Update map coordinates whenever drivers or active rides list changes
  useEffect(() => {
    if (activeTab === 'live' && mapInstanceRef.current) {
      updateMapMarkersAndRoutes();
    }
  }, [driversList, liveRides, activeTab]);


  // Check login on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      if (token) {
        try {
          const profile = await api.getProfile();
          if (profile.success && profile.user.role === 'admin') {
            setAdminUser(profile.user);
            setIsLoggedIn(true);
          } else {
            setToken(null);
          }
        } catch (err) {
          setToken(null);
        }
      }
    };
    checkAuth();
  }, []);

  // Fetch data depending on active tab
  useEffect(() => {
    if (!isLoggedIn) return;

    if (activeTab === 'dashboard') {
      fetchDashboardData();
    } else if (activeTab === 'users') {
      fetchUsersData();
    } else if (activeTab === 'drivers') {
      fetchDriversData();
    } else if (activeTab === 'live') {
      fetchLiveTracking();
    } else if (activeTab === 'pricing') {
      fetchPricingData();
    } else if (activeTab === 'rides') {
      fetchRidesData();
    }
  }, [isLoggedIn, activeTab]);

  // Setup Socket.io for live updates when logged in
  useEffect(() => {
    if (!isLoggedIn || !adminUser) return;

    // Connect socket
    const s = io('https://infastgo-backendd.onrender.com');
    setSocket(s);

    s.on('connect', () => {
      console.log('[Admin Socket] Connected');
      s.emit('join', { userId: adminUser.id, role: 'admin' });
    });

    s.on('rideUpdate', (ride) => {
      console.log('[Admin Socket] Live ride status update:', ride);
      // Update local state if we are on live tab
      setLiveRides((prev) => {
        const idx = prev.findIndex((r) => r._id === ride._id);
        if (idx > -1) {
          const updated = [...prev];
          updated[idx] = ride;
          return updated;
        } else {
          return [ride, ...prev];
        }
      });
      // Refresh stats automatically
      fetchDashboardData();
    });

    s.on('driverLocationUpdate', (locUpdate) => {
      // Update driver coordinate in live panel
      setDriversList((prev) =>
        prev.map((drv) =>
          drv._id === locUpdate.driverId
            ? { ...drv, currentLocation: { lat: locUpdate.lat, lng: locUpdate.lng } }
            : drv
        )
      );
    });

    s.on('disconnect', () => {
      console.log('[Admin Socket] Disconnected');
    });

    return () => {
      s.disconnect();
    };
  }, [isLoggedIn, adminUser]);

  // Data Fetching functions
  const fetchDashboardData = async () => {
    try {
      const res = await api.getStats();
      if (res.success) setStats(res.stats);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsersData = async () => {
    try {
      const res = await api.getUsers();
      if (res.success) setUsersList(res.users);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDriversData = async () => {
    try {
      const res = await api.getDrivers();
      if (res.success) setDriversList(res.drivers);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLiveTracking = async () => {
    try {
      const res = await api.getLive();
      if (res.success) {
        setLiveRides(res.activeRides);
        setDriversList(res.drivers);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPricingData = async () => {
    try {
      const res = await api.getPricing();
      if (res.success) setPricing(res.pricing);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRidesData = async () => {
    try {
      const res = await api.getRides();
      if (res.success) setRidesList(res.rides);
    } catch (err) {
      console.error(err);
    }
  };

  // Admin Login Handling (username/password)
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (!loginName || !loginPassword) {
      setError('Login va parolni kiriting');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await api.adminLogin(loginName, loginPassword);
      if (res.success) {
        if (res.user.role !== 'admin') {
          setError('Kirish taqiqlandi. Ushbu hisob administrator emas.');
          setToken(null);
        } else {
          setAdminUser(res.user);
          setToken(res.token);
          setIsLoggedIn(true);
        }
      }
    } catch (err) {
      setError(err.message || 'Tizimga kirishda xatolik');
    } finally {
      setLoading(false);
    }
  };

  // User Action handling
  const handleToggleBlockUser = async (userId) => {
    try {
      const res = await api.blockUser(userId);
      if (res.success) {
        setUsersList((prev) =>
          prev.map((u) => (u._id === userId ? { ...u, isBlocked: res.user.isBlocked } : u))
        );
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Driver actions
  const handleToggleDriverActive = async (driverId) => {
    try {
      const res = await api.toggleDriverActive(driverId);
      if (res.success) {
        setDriversList((prev) =>
          prev.map((d) => (d._id === driverId ? { ...d, isActive: res.driver.isActive } : d))
        );
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateDriver = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        phone: newDriver.phone,
        name: newDriver.name,
        surname: newDriver.surname,
        carInfo: {
          make: newDriver.carMake,
          model: newDriver.carModel,
          color: newDriver.carColor,
          plateNumber: newDriver.carPlate,
        },
        tariffs: newDriver.tariffs,
      };

      const res = await api.createDriver(payload);
      if (res.success) {
        setDriversList((prev) => [res.driver, ...prev]);
        setDriverModal(false);
        setNewDriver({
          phone: '+99890',
          name: '',
          surname: '',
          carMake: 'Chevrolet',
          carModel: '',
          carColor: '',
          carPlate: '',
          tariffs: ['standart'],
        });
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Pricing Actions
  const handleUpdatePricing = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.updatePricing(pricing);
      if (res.success) {
        alert('Tariflar yangilandi!');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Push Notifications Actions
  const handleSendPush = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPushStatus('');
    try {
      const res = await api.sendPush(pushForm);
      if (res.success) {
        setPushStatus('Push xabarnoma muvaffaqiyatli yuborildi!');
        setPushForm((prev) => ({ ...prev, title: '', body: '' }));
      }
    } catch (err) {
      setPushStatus(`Xatolik: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setIsLoggedIn(false);
    setAdminUser(null);
    setLoginName('');
    setLoginPassword('');
  };

  // Seed DB manual trigger helper
  const handleTriggerSeeding = async () => {
    try {
      const res = await api.triggerSeed();
      if (res && res.success) {
        alert('Demo ma\'lumotlar yuklandi!');
        if (isLoggedIn) {
          fetchDashboardData();
        }
      } else {
        alert('Seeding xatoligi');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Main UI Renders
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative">
          <div className="absolute top-4 right-4">
            <button
              onClick={handleTriggerSeeding}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 py-1 px-2.5 rounded border border-slate-700 font-semibold"
            >
              🛠️ Seed Database
            </button>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-green-400 tracking-tight">InFast Go</h1>
            <p className="text-slate-400 text-sm mt-2">Administrator Boshqaruv Paneli</p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Login
              </label>
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                className="w-full bg-slate-950 text-slate-100 placeholder-slate-700 border border-slate-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-green-400 focus:outline-none text-lg"
                placeholder="Login kiriting"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Parol
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-slate-950 text-slate-100 placeholder-slate-700 border border-slate-800 rounded-xl py-3 px-4 focus:ring-2 focus:ring-green-400 focus:outline-none text-lg"
                placeholder="••••••••"
              />
            </div>

            {error && <div className="text-red-400 text-sm">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-400 hover:bg-green-500 text-slate-950 font-bold py-3 px-4 rounded-xl transition duration-150 flex items-center justify-center"
            >
              {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : 'Tizimga kirish'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <span className="text-2xl">🚖</span>
            <div>
              <h1 className="text-lg font-bold text-slate-100">InFast Go</h1>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                Panel v1.0
              </p>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium text-sm ${
                activeTab === 'dashboard'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('live')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium text-sm ${
                activeTab === 'live'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Activity size={18} />
              <span>Jonli Monitoring</span>
            </button>

            <button
              onClick={() => setActiveTab('rides')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium text-sm ${
                activeTab === 'rides'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`}
            >
              <History size={18} />
              <span>Safarlar Tarixi</span>
            </button>

            <button
              onClick={() => setActiveTab('drivers')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium text-sm ${
                activeTab === 'drivers'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Car size={18} />
              <span>Haydovchilar</span>
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium text-sm ${
                activeTab === 'users'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Users size={18} />
              <span>Yo'lovchilar</span>
            </button>

            <button
              onClick={() => setActiveTab('pricing')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium text-sm ${
                activeTab === 'pricing'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Settings size={18} />
              <span>Tarif Sozlamalari</span>
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition font-medium text-sm ${
                activeTab === 'notifications'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Bell size={18} />
              <span>Push Xabarlar</span>
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-xs text-slate-500">Admin: {adminUser.phone}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-400 hover:bg-red-500/5 rounded-xl transition font-medium text-sm border border-transparent hover:border-red-500/10"
          >
            <LogOut size={18} />
            <span>Chiqish</span>
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
                <p className="text-slate-400 text-sm">Tizim holati bo'yicha umumiy statistika</p>
              </div>
              <button
                onClick={fetchDashboardData}
                className="bg-slate-900 border border-slate-800 text-slate-300 py-2.5 px-4 rounded-xl hover:bg-slate-805 text-sm transition"
              >
                Yangilash
              </button>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
                <div>
                  <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider block">
                    Foydalanuvchilar (Yo'lovchi)
                  </span>
                  <span className="text-3xl font-extrabold text-slate-100 block mt-2">
                    {stats.totalUsers}
                  </span>
                </div>
                <div className="bg-green-500/10 p-3.5 rounded-xl text-green-400">
                  <Users size={22} />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
                <div>
                  <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider block">
                    Ro'yxatdan o'tgan Haydovchilar
                  </span>
                  <span className="text-3xl font-extrabold text-slate-100 block mt-2">
                    {stats.totalDrivers}
                  </span>
                </div>
                <div className="bg-green-500/10 p-3.5 rounded-xl text-green-400">
                  <Car size={22} />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
                <div>
                  <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider block">
                    Faol buyurtmalar (Rides)
                  </span>
                  <span className="text-3xl font-extrabold text-slate-100 block mt-2">
                    {stats.activeRides}
                  </span>
                </div>
                <div className="bg-green-500/10 p-3.5 rounded-xl text-green-400">
                  <Activity size={22} />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
                <div>
                  <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider block">
                    Umumiy tushum
                  </span>
                  <span className="text-3xl font-extrabold text-green-400 block mt-2">
                    {stats.revenue.toLocaleString()} UZS
                  </span>
                </div>
                <div className="bg-green-500/10 p-3.5 rounded-xl text-green-400">
                  <TrendingUp size={22} />
                </div>
              </div>
            </div>

            {/* Quick action list / welcome card */}
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl flex flex-col md:flex-row md:items-center justify-between">
              <div className="mb-4 md:mb-0">
                <h3 className="text-lg font-bold text-slate-100">Jonli rejimda boshqarish</h3>
                <p className="text-slate-400 text-sm mt-1">
                  Xaritada buyurtmalar oqimini va haydovchilar holatini jonli monitoring orqali kuzatib boring.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('live')}
                className="bg-green-400 hover:bg-green-500 text-slate-950 font-bold py-3 px-6 rounded-xl transition duration-150 inline-flex items-center justify-center text-sm"
              >
                Jonli Monitoringga o'tish
              </button>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Yo'lovchilar</h2>
                <p className="text-slate-400 text-sm">Foydalanuvchilar ro'yxati va bloklash boshqaruvi</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 uppercase bg-slate-900/50">
                    <th className="py-4 px-6">Ism / Familiya</th>
                    <th className="py-4 px-6">Telefon Raqam</th>
                    <th className="py-4 px-6">Rol</th>
                    <th className="py-4 px-6">Holat</th>
                    <th className="py-4 px-6 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {usersList.map((user) => (
                    <tr key={user._id} className="hover:bg-slate-800/20">
                      <td className="py-4 px-6 font-semibold">
                        {user.name || 'Noma\'lum'} {user.surname || ''}
                      </td>
                      <td className="py-4 px-6 text-slate-300">{user.phone}</td>
                      <td className="py-4 px-6 text-slate-400">
                        <span className="bg-slate-800 py-1 px-2.5 rounded text-xs">
                          {user.role}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {user.isBlocked ? (
                          <span className="text-red-400 inline-flex items-center space-x-1.5 font-medium text-xs">
                            <ShieldAlert size={14} />
                            <span>Bloklangan</span>
                          </span>
                        ) : (
                          <span className="text-green-400 inline-flex items-center space-x-1.5 font-medium text-xs">
                            <ShieldCheck size={14} />
                            <span>Faol</span>
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleToggleBlockUser(user._id)}
                          className={`py-1.5 px-3.5 rounded-lg text-xs font-semibold transition ${
                            user.isBlocked
                              ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                              : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          }`}
                        >
                          {user.isBlocked ? 'Blokdan ochish' : 'Bloklash'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {usersList.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-slate-500">
                        Yo'lovchilar topilmadi
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'drivers' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Haydovchilar</h2>
                <p className="text-slate-400 text-sm">Haydovchi akkauntlari va mashina ma'lumotlari boshqaruvi</p>
              </div>
              <button
                onClick={() => setDriverModal(true)}
                className="bg-green-400 hover:bg-green-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-sm flex items-center transition"
              >
                <Plus size={18} className="mr-1.5" /> Haydovchi Qo'shish
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 uppercase bg-slate-900/50">
                    <th className="py-4 px-6">Haydovchi</th>
                    <th className="py-4 px-6">Telefon</th>
                    <th className="py-4 px-6">Mashina</th>
                    <th className="py-4 px-6">Reyting / Balans</th>
                    <th className="py-4 px-6">Tizim holati</th>
                    <th className="py-4 px-6">Akkaunt holati</th>
                    <th className="py-4 px-6 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {driversList.map((drv) => (
                    <tr key={drv._id} className="hover:bg-slate-800/20">
                      <td className="py-4 px-6 font-semibold">
                        {drv.name} {drv.surname}
                      </td>
                      <td className="py-4 px-6 text-slate-300">{drv.phone}</td>
                      <td className="py-4 px-6 text-slate-300">
                        <div>
                          {drv.carInfo?.color} {drv.carInfo?.make} {drv.carInfo?.model}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {drv.carInfo?.plateNumber}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(drv.tariffs || []).map(t => (
                            <span key={t} className="text-[9px] font-bold uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-300">
                        <div>⭐️ {drv.rating?.toFixed(2) || '5.00'}</div>
                        <div className="text-xs text-green-400 mt-0.5">
                          {drv.earnings?.toLocaleString()} UZS
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${
                            drv.status === 'online'
                              ? 'bg-green-400'
                              : drv.status === 'busy'
                              ? 'bg-yellow-400'
                              : 'bg-slate-600'
                          }`}
                        ></span>
                        <span className="capitalize text-slate-300">{drv.status}</span>
                      </td>
                      <td className="py-4 px-6">
                        {drv.isActive ? (
                          <span className="text-green-400 font-medium text-xs">Faol</span>
                        ) : (
                          <span className="text-red-400 font-medium text-xs">Faolsiz</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleToggleDriverActive(drv._id)}
                          className={`py-1.5 px-3.5 rounded-lg text-xs font-semibold transition ${
                            drv.isActive
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                          }`}
                        >
                          {drv.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {driversList.length === 0 && (
                    <tr>
                      <td colSpan="7" className="py-8 text-center text-slate-500">
                        Haydovchilar mavjud emas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Create Driver Modal */}
            {driverModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
                  <h3 className="text-xl font-bold mb-4">Yangi Haydovchi Qo'shish</h3>
                  <form onSubmit={handleCreateDriver} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Ismi</label>
                        <input
                          type="text"
                          required
                          value={newDriver.name}
                          onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:ring-1 focus:ring-green-400 text-sm"
                          placeholder="Bahodir"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Familiyasi</label>
                        <input
                          type="text"
                          required
                          value={newDriver.surname}
                          onChange={(e) => setNewDriver({ ...newDriver, surname: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:ring-1 focus:ring-green-400 text-sm"
                          placeholder="Rahimov"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Telefon Raqami</label>
                      <input
                        type="text"
                        required
                        value={newDriver.phone}
                        onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:ring-1 focus:ring-green-400 text-sm"
                        placeholder="+998901234567"
                      />
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Mashina Ma'lumotlari
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Brend (Make)</label>
                          <input
                            type="text"
                            required
                            value={newDriver.carMake}
                            onChange={(e) => setNewDriver({ ...newDriver, carMake: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:ring-1 focus:ring-green-400 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Model</label>
                          <input
                            type="text"
                            required
                            value={newDriver.carModel}
                            onChange={(e) => setNewDriver({ ...newDriver, carModel: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:ring-1 focus:ring-green-400 text-sm"
                            placeholder="Cobalt"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Rangi</label>
                          <input
                            type="text"
                            required
                            value={newDriver.carColor}
                            onChange={(e) => setNewDriver({ ...newDriver, carColor: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:ring-1 focus:ring-green-400 text-sm"
                            placeholder="Oq"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Davlat Raqami</label>
                          <input
                            type="text"
                            required
                            value={newDriver.carPlate}
                            onChange={(e) => setNewDriver({ ...newDriver, carPlate: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 focus:outline-none focus:ring-1 focus:ring-green-400 text-sm"
                            placeholder="01A123BC"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Tariflar (Maksimum 2 ta)
                      </h4>
                      <div className="flex space-x-6 bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                        {['standart', 'komfort', 'biznes'].map((tariff) => {
                          const isChecked = (newDriver.tariffs || []).includes(tariff);
                          return (
                            <label key={tariff} className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer capitalize">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  let updatedTariffs = [...(newDriver.tariffs || [])];
                                  if (e.target.checked) {
                                    if (updatedTariffs.length >= 2) {
                                      alert("Ko'pi bilan 2 ta tarif tanlash mumkin!");
                                      return;
                                    }
                                    updatedTariffs.push(tariff);
                                  } else {
                                    updatedTariffs = updatedTariffs.filter(t => t !== tariff);
                                  }
                                  setNewDriver({ ...newDriver, tariffs: updatedTariffs });
                                }}
                                className="rounded border-slate-800 bg-slate-900 text-green-400 focus:ring-green-400 w-4 h-4"
                              />
                              <span className="select-none font-medium">{tariff}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setDriverModal(false)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-4 rounded-xl text-sm transition"
                      >
                        Bekor qilish
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="bg-green-400 hover:bg-green-500 text-slate-950 font-bold py-2 px-5 rounded-xl text-sm transition"
                      >
                        Qo'shish
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'live' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Jonli Monitoring</h2>
                <p className="text-slate-400 text-sm">Faol sayohatlar va online haydovchilar</p>
              </div>
              <button
                onClick={fetchLiveTracking}
                className="bg-slate-900 border border-slate-800 text-slate-300 py-2.5 px-4 rounded-xl hover:bg-slate-805 text-sm transition"
              >
                Yangilash
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Active rides list */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg h-[600px] flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold mb-4 flex items-center">
                    <Activity size={18} className="text-green-400 mr-2 animate-pulse" />
                    Faol buyurtmalar ({liveRides.length})
                  </h3>
                  <div className="space-y-4 overflow-y-auto max-h-[480px]">
                    {liveRides.map((ride) => (
                      <div
                        key={ride._id}
                        className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 py-0.5 px-2.5 rounded text-[10px] uppercase font-bold tracking-wider">
                            {ride.status}
                          </span>
                          <span className="text-green-400 font-bold text-sm">
                            {ride.price?.toLocaleString()} UZS
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                          <p>🟢 A (Jo'nash): {ride.pickup?.address}</p>
                          <p>🔴 B (Borish): {ride.destination?.address}</p>
                        </div>
                        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-850 flex justify-between">
                          <span>Yo'lovchi: {ride.userId?.name || 'Seeded User'}</span>
                          {ride.driverId && <span>Haydovchi: {ride.driverId.name}</span>}
                        </div>
                      </div>
                    ))}
                    {liveRides.length === 0 && (
                      <p className="text-slate-500 text-center py-12 text-sm">
                        Hozircha faol buyurtmalar yo'q
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Real Mapbox GL Map */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col h-[600px]">
                <h3 className="text-lg font-bold mb-4 flex items-center">
                  <MapPin size={18} className="text-green-400 mr-2" /> Jonli Map (Mapbox)
                </h3>
                
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl relative overflow-hidden">
                  <div id="mapbox-admin-map" className="w-full h-full rounded-xl"></div>
                </div>

                <div className="flex space-x-6 mt-4 text-xs text-slate-500">
                  <div className="flex items-center">
                    <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full mr-2"></span>
                    <span>Haydovchi (Bo'sh)</span>
                  </div>
                  <div className="flex items-center">
                    <span className="w-2.5 h-2.5 bg-amber-400 rounded-full mr-2"></span>
                    <span>Haydovchi (Band)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Tarif Sozlamalari</h2>
              <p className="text-slate-400 text-sm">Tizim bo'yicha tariflar narxlarini boshqarish</p>
            </div>

            <div className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <form onSubmit={handleUpdatePricing} className="space-y-6">
                {/* Standart Tariff */}
                <div className="border-b border-slate-800 pb-5">
                  <h3 className="text-sm font-bold text-green-400 uppercase tracking-wider mb-3">
                    🟢 Standart (Nexia 2)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        Boshlang'ich Narx (Base Fare) (UZS)
                      </label>
                      <input
                        type="number"
                        value={pricing.tariffs?.standart?.baseFare || 5000}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setPricing({
                            ...pricing,
                            tariffs: {
                              ...pricing.tariffs,
                              standart: { ...pricing.tariffs.standart, baseFare: val }
                            }
                          });
                        }}
                        className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-2.5 px-3.5 focus:ring-1 focus:ring-green-400 focus:outline-none text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        Kilometr Narxi (UZS)
                      </label>
                      <input
                        type="number"
                        value={pricing.tariffs?.standart?.pricePerKm || 1500}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setPricing({
                            ...pricing,
                            tariffs: {
                              ...pricing.tariffs,
                              standart: { ...pricing.tariffs.standart, pricePerKm: val }
                            }
                          });
                        }}
                        className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-2.5 px-3.5 focus:ring-1 focus:ring-green-400 focus:outline-none text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Komfort Tariff */}
                <div className="border-b border-slate-800 pb-5">
                  <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-3">
                    🟡 Komfort (Cobalt)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        Boshlang'ich Narx (Base Fare) (UZS)
                      </label>
                      <input
                        type="number"
                        value={pricing.tariffs?.komfort?.baseFare || 7000}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setPricing({
                            ...pricing,
                            tariffs: {
                              ...pricing.tariffs,
                              komfort: { ...pricing.tariffs.komfort, baseFare: val }
                            }
                          });
                        }}
                        className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-2.5 px-3.5 focus:ring-1 focus:ring-green-400 focus:outline-none text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        Kilometr Narxi (UZS)
                      </label>
                      <input
                        type="number"
                        value={pricing.tariffs?.komfort?.pricePerKm || 2000}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setPricing({
                            ...pricing,
                            tariffs: {
                              ...pricing.tariffs,
                              komfort: { ...pricing.tariffs.komfort, pricePerKm: val }
                            }
                          });
                        }}
                        className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-2.5 px-3.5 focus:ring-1 focus:ring-green-400 focus:outline-none text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Biznes Tariff */}
                <div className="border-b border-slate-800 pb-5">
                  <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-3">
                    🔴 Biznes (Malibu)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        Boshlang'ich Narx (Base Fare) (UZS)
                      </label>
                      <input
                        type="number"
                        value={pricing.tariffs?.biznes?.baseFare || 10000}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setPricing({
                            ...pricing,
                            tariffs: {
                              ...pricing.tariffs,
                              biznes: { ...pricing.tariffs.biznes, baseFare: val }
                            }
                          });
                        }}
                        className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-2.5 px-3.5 focus:ring-1 focus:ring-green-400 focus:outline-none text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        Kilometr Narxi (UZS)
                      </label>
                      <input
                        type="number"
                        value={pricing.tariffs?.biznes?.pricePerKm || 3000}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setPricing({
                            ...pricing,
                            tariffs: {
                              ...pricing.tariffs,
                              biznes: { ...pricing.tariffs.biznes, pricePerKm: val }
                            }
                          });
                        }}
                        className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-2.5 px-3.5 focus:ring-1 focus:ring-green-400 focus:outline-none text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Surge Multiplier */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Tirbandlik Koeffitsiyenti (Surge Multiplier)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    value={pricing.surgeMultiplier || 1.0}
                    onChange={(e) => setPricing({ ...pricing, surgeMultiplier: parseFloat(e.target.value) || 1.0 })}
                    className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-2.5 px-3.5 focus:ring-1 focus:ring-green-400 focus:outline-none text-sm"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-400 hover:bg-green-500 text-slate-950 font-bold py-3 rounded-xl transition duration-150 text-sm"
                >
                  {loading ? 'Saqlanmoqda...' : 'Tarif narxlarini saqlash'}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Push Xabarnomalar</h2>
              <p className="text-slate-400 text-sm">Foydalanuvchilarga push bildirishnomalarni yuborish paneli</p>
            </div>

            <div className="max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <form onSubmit={handleSendPush} className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Kimga Yuboriladi (Recipient)
                  </label>
                  <select
                    value={pushForm.recipientType}
                    onChange={(e) => setPushForm({ ...pushForm, recipientType: e.target.value })}
                    className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-3 px-4 focus:ring-1 focus:ring-green-400 focus:outline-none"
                  >
                    <option value="all">Barcha foydalanuvchilar (Hammasi)</option>
                    <option value="users">Faqat Yo'lovchilar</option>
                    <option value="drivers">Faqat Haydovchilar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Sarlavha (Title)
                  </label>
                  <input
                    type="text"
                    value={pushForm.title}
                    onChange={(e) => setPushForm({ ...pushForm, title: e.target.value })}
                    className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-3 px-4 focus:ring-1 focus:ring-green-400 focus:outline-none"
                    placeholder="Tezkor Xabar!"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Xabar matni (Body)
                  </label>
                  <textarea
                    value={pushForm.body}
                    onChange={(e) => setPushForm({ ...pushForm, body: e.target.value })}
                    className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl py-3 px-4 focus:ring-1 focus:ring-green-400 focus:outline-none h-32"
                    placeholder="Tizimda yangi tariflar joriy etildi."
                    required
                  />
                </div>

                {pushStatus && (
                  <div className={`p-3 rounded-lg text-sm ${
                    pushStatus.includes('Xatolik') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                  }`}>
                    {pushStatus}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-400 hover:bg-green-500 text-slate-950 font-bold py-3 rounded-xl transition duration-150 flex items-center justify-center"
                >
                  <Send size={16} className="mr-2" />
                  {loading ? 'Yuborilmoqda...' : 'Push yuborish'}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'rides' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Safarlar Tarixi</h2>
                <p className="text-slate-400 text-sm">Barcha safarlar bo'yicha to'liq ma'lumotlar</p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-slate-500 text-sm">Jami: <b className="text-slate-200">{ridesList.length}</b> ta safar</span>
                <button
                  onClick={fetchRidesData}
                  className="bg-slate-900 border border-slate-800 text-slate-300 py-2.5 px-4 rounded-xl hover:bg-slate-800 text-sm transition"
                >
                  Yangilash
                </button>
              </div>
            </div>

            {/* Status filter badges */}
            <div className="flex flex-wrap gap-2">
              {['all', 'completed', 'cancelled', 'searching', 'accepted', 'arriving', 'started'].map((st) => {
                const count = st === 'all' ? ridesList.length : ridesList.filter(r => r.status === st).length;
                const colors = {
                  all: 'bg-slate-800 text-slate-200 border-slate-700',
                  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
                  searching: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                  accepted: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                  arriving: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                  started: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
                };
                const labels = { all: 'Hammasi', completed: 'Tugallangan', cancelled: 'Bekor qilingan', searching: 'Qidirilmoqda', accepted: 'Qabul qilingan', arriving: 'Kelyapti', started: 'Boshlangan' };
                return (
                  <span key={st} className={`text-[11px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-lg border ${colors[st]}`}>
                    {labels[st]} ({count})
                  </span>
                );
              })}
            </div>

            {/* Rides list */}
            <div className="space-y-3">
              {ridesList.length === 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
                  <History size={40} className="text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-500 text-sm">Safarlar tarixi hali bo'sh</p>
                </div>
              )}

              {ridesList.map((ride) => {
                const isExpanded = expandedRide === ride._id;
                const statusColors = {
                  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
                  searching: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                  accepted: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                  arriving: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                  started: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
                };
                const statusLabels = { completed: 'Tugallangan', cancelled: 'Bekor qilingan', searching: 'Qidirilmoqda', accepted: 'Qabul qilingan', arriving: 'Kelyapti', started: 'Boshlangan' };
                const tariffColors = { standart: 'text-green-400', komfort: 'text-yellow-400', biznes: 'text-red-400' };
                const tariffIcons = { standart: '🟢', komfort: '🟡', biznes: '🔴' };

                return (
                  <div
                    key={ride._id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition-all duration-200 hover:border-slate-700"
                  >
                    {/* Collapsed header row */}
                    <button
                      onClick={() => setExpandedRide(isExpanded ? null : ride._id)}
                      className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/30 transition"
                    >
                      <div className="flex items-center space-x-4 flex-1 min-w-0">
                        {/* Status badge */}
                        <span className={`text-[10px] font-bold uppercase tracking-wider py-1 px-2.5 rounded border whitespace-nowrap ${statusColors[ride.status] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          {statusLabels[ride.status] || ride.status}
                        </span>

                        {/* Route summary */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 text-sm">
                            <span className="text-emerald-400">A</span>
                            <span className="text-slate-300 truncate max-w-[200px]">{ride.pickup?.address || 'Noma\'lum'}</span>
                            <span className="text-slate-600">→</span>
                            <span className="text-red-400">B</span>
                            <span className="text-slate-300 truncate max-w-[200px]">{ride.destination?.address || 'Noma\'lum'}</span>
                          </div>
                        </div>

                        {/* Price */}
                        <span className="text-green-400 font-bold text-sm whitespace-nowrap">
                          {ride.price?.toLocaleString()} UZS
                        </span>

                        {/* Tariff */}
                        <span className={`text-xs font-semibold capitalize whitespace-nowrap ${tariffColors[ride.tariff] || 'text-slate-400'}`}>
                          {tariffIcons[ride.tariff] || ''} {ride.tariff}
                        </span>

                        {/* Date */}
                        <span className="text-slate-500 text-xs whitespace-nowrap">
                          {new Date(ride.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      </div>

                      {isExpanded ? <ChevronUp size={18} className="text-slate-500 ml-3 shrink-0" /> : <ChevronDown size={18} className="text-slate-500 ml-3 shrink-0" />}
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 p-6 bg-slate-950/50 space-y-6">
                        {/* Route details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                              <Route size={14} className="mr-2 text-green-400" />
                              Marshrut Ma'lumotlari
                            </h4>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                              <div>
                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">A — Jo'nash nuqtasi</span>
                                <p className="text-slate-200 text-sm mt-1">{ride.pickup?.address || 'Noma\'lum'}</p>
                                <p className="text-slate-600 text-[10px] font-mono mt-0.5">
                                  {ride.pickup?.lat?.toFixed(6)}, {ride.pickup?.lng?.toFixed(6)}
                                </p>
                              </div>
                              <div className="border-t border-slate-800 pt-3">
                                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">B — Borish nuqtasi</span>
                                <p className="text-slate-200 text-sm mt-1">{ride.destination?.address || 'Noma\'lum'}</p>
                                <p className="text-slate-600 text-[10px] font-mono mt-0.5">
                                  {ride.destination?.lat?.toFixed(6)}, {ride.destination?.lng?.toFixed(6)}
                                </p>
                              </div>
                              <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
                                <span className="text-slate-500 text-xs">Masofa:</span>
                                <span className="text-slate-200 font-bold text-sm">{ride.distance?.toFixed(1)} km</span>
                              </div>
                            </div>
                          </div>

                          {/* People & Contact */}
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                              <Phone size={14} className="mr-2 text-green-400" />
                              Ishtirokchilar
                            </h4>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                              {/* User info */}
                              <div>
                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">👤 Yo'lovchi</span>
                                <div className="flex items-center justify-between mt-1.5">
                                  <p className="text-slate-200 text-sm font-semibold">
                                    {ride.userId?.name || 'Noma\'lum'} {ride.userId?.surname || ''}
                                  </p>
                                  <a href={`tel:${ride.userId?.phone}`} className="text-green-400 text-xs font-mono bg-green-500/10 py-1 px-2 rounded border border-green-500/20 hover:bg-green-500/20 transition">
                                    📞 {ride.userId?.phone || 'Raqam yo\'q'}
                                  </a>
                                </div>
                              </div>

                              <div className="border-t border-slate-800 pt-3">
                                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">🚘 Haydovchi</span>
                                {ride.driverId ? (
                                  <div className="mt-1.5">
                                    <div className="flex items-center justify-between">
                                      <p className="text-slate-200 text-sm font-semibold">
                                        {ride.driverId.name} {ride.driverId.surname}
                                      </p>
                                      <a href={`tel:${ride.driverId.phone}`} className="text-green-400 text-xs font-mono bg-green-500/10 py-1 px-2 rounded border border-green-500/20 hover:bg-green-500/20 transition">
                                        📞 {ride.driverId.phone}
                                      </a>
                                    </div>
                                    {ride.driverId.carInfo && (
                                      <p className="text-slate-500 text-xs mt-1">
                                        🚗 {ride.driverId.carInfo.color} {ride.driverId.carInfo.make} {ride.driverId.carInfo.model} — <span className="font-mono">{ride.driverId.carInfo.plateNumber}</span>
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-slate-500 text-xs mt-1">Haydovchi tayinlanmagan</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Financial + Status + Timestamps */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Financial */}
                          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">💰 Moliyaviy</span>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-xs">Narx:</span>
                                <span className="text-green-400 font-bold">{ride.price?.toLocaleString()} UZS</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-xs">Tarif:</span>
                                <span className={`font-semibold text-sm capitalize ${tariffColors[ride.tariff] || 'text-slate-300'}`}>
                                  {tariffIcons[ride.tariff]} {ride.tariff}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-xs">Masofa:</span>
                                <span className="text-slate-200 text-sm">{ride.distance?.toFixed(1)} km</span>
                              </div>
                              {ride.rating > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500 text-xs">Baho:</span>
                                  <span className="text-amber-400 text-sm">⭐️ {ride.rating}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Options */}
                          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3">⚙️ Parametrlar</span>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-xs">Konditsioner:</span>
                                <span className={`text-xs font-semibold ${ride.options?.ac ? 'text-green-400' : 'text-slate-600'}`}>
                                  {ride.options?.ac ? '✅ Ha' : '❌ Yo\'q'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-xs">Yuk (Bagaj):</span>
                                <span className={`text-xs font-semibold ${ride.options?.luggage ? 'text-green-400' : 'text-slate-600'}`}>
                                  {ride.options?.luggage ? '✅ Ha' : '❌ Yo\'q'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-xs">Holat:</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider py-0.5 px-2 rounded border ${statusColors[ride.status] || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                  {statusLabels[ride.status] || ride.status}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Timestamps */}
                          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-3 flex items-center">
                              <Clock size={12} className="mr-1.5" /> Vaqt Jadvali
                            </span>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-xs">Yaratilgan:</span>
                                <span className="text-slate-300 text-xs font-mono">
                                  {new Date(ride.createdAt).toLocaleString('uz-UZ')}
                                </span>
                              </div>
                              {ride.acceptedAt && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500 text-xs">Qabul qilingan:</span>
                                  <span className="text-slate-300 text-xs font-mono">
                                    {new Date(ride.acceptedAt).toLocaleString('uz-UZ')}
                                  </span>
                                </div>
                              )}
                              {ride.startedAt && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500 text-xs">Boshlangan:</span>
                                  <span className="text-slate-300 text-xs font-mono">
                                    {new Date(ride.startedAt).toLocaleString('uz-UZ')}
                                  </span>
                                </div>
                              )}
                              {ride.completedAt && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500 text-xs">Tugallangan:</span>
                                  <span className="text-emerald-400 text-xs font-mono">
                                    {new Date(ride.completedAt).toLocaleString('uz-UZ')}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Ride ID */}
                        <div className="text-right">
                          <span className="text-slate-600 text-[10px] font-mono">ID: {ride._id}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
