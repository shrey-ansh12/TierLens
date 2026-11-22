"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  Layers,
  Smartphone,
  Globe,
  Sliders,
  AlertOctagon,
  Brain,
  CheckCircle2,
  GitCompare,
  Terminal,
  ShieldCheck,
  FileCode,
  Settings,
  BookOpen,
  History,
  TrendingDown,
  Upload,
  Play,
  RotateCcw,
  Check,
  X,
  ExternalLink,
  Info,
  Database,
  Cpu,
  Wifi,
  Radio,
  FileText,
  Plus,
  Copy,
  Trash2,
  Edit3,
  HardDrive,
  Monitor,
  Gauge,
  Save,
  RefreshCw,
  ChevronRight,
  CheckSquare,
  Square,
  Wrench,
  Sparkles,
  HelpCircle,
  Menu,
  Eye
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from "recharts";
import IntelligenceGraph from "@/components/IntelligenceGraph";
import IntelligenceExplorer from "@/components/IntelligenceExplorer";
import HealthScoreCard from "@/components/HealthScoreCard";
import VisualEvidenceViewer from "@/components/VisualEvidenceViewer";
import LiveTestingArena from "@/components/LiveTestingArena";
import AuditReportModal from "@/components/AuditReportModal";
import AuditReportsView from "@/components/AuditReportsView";
import { ApiClient } from "@/lib/api";

type TabType =
  | "overview"
  | "web_test"
  | "live_arena"
  | "device_builder"
  | "android_test"
  | "compare"
  | "device_lab"
  | "failures"
  | "rca"
  | "graph"
  | "history"
  | "reports"
  | "settings"
  | "docs";

interface DeviceProfileData {
  id: string;
  name: string;
  tier: string;
  platform: string;
  device_type: string;
  cpu_cores: number;
  cpu_category: string;
  cpu_throttle_rate: number;
  cpu_slowdown_multiplier: number;
  storage_profile: string;
  storage_capacity_gb: number;
  storage_available_gb: number;
  network_profile: string;
  network_down_kbps: number;
  network_up_kbps: number;
  network_latency_ms: number;
  network_packet_loss: number;
  viewport_width: number;
  viewport_height: number;
  device_scale_factor: number;
  is_mobile: boolean;
  has_touch: boolean;
  user_agent?: string;
  ram_mb: number;
  is_custom: boolean;
  description?: string;
}

const PRESET_TEMPLATES = [
  {
    device_type: "Entry-level Android",
    name: "Entry-level Android (2-Core, 2GB)",
    ram_mb: 2048,
    cpu_cores: 2,
    cpu_category: "2-core low-end",
    cpu_throttle_rate: 8.0,
    storage_profile: "Low-speed storage profile",
    storage_capacity_gb: 32,
    storage_available_gb: 4,
    network_profile: "Slow 3G",
    network_down_kbps: 500,
    network_up_kbps: 250,
    network_latency_ms: 200,
    viewport_width: 360,
    viewport_height: 800,
    device_scale_factor: 2.0,
    is_mobile: true,
    has_touch: true,
    user_agent: "Mozilla/5.0 (Linux; Android 11; M2006C3LG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
    description: "Emulates constrained entry-level Android hardware (~$70-$100 bracket, e.g. Redmi 9A / Nokia C-series)."
  },
  {
    device_type: "Budget Android",
    name: "Budget Android (4-Core, 4GB)",
    ram_mb: 4096,
    cpu_cores: 4,
    cpu_category: "4-core budget",
    cpu_throttle_rate: 4.0,
    storage_profile: "Standard storage profile",
    storage_capacity_gb: 64,
    storage_available_gb: 16,
    network_profile: "Fast 3G",
    network_down_kbps: 1600,
    network_up_kbps: 750,
    network_latency_ms: 40,
    viewport_width: 390,
    viewport_height: 844,
    device_scale_factor: 2.5,
    is_mobile: true,
    has_touch: true,
    user_agent: "Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
    description: "Emulates modern budget Android hardware (~$150-$200 bracket, e.g. Samsung Galaxy A14 / Moto G)."
  },
  {
    device_type: "Mid-range Android",
    name: "Mid-range Android (6-Core, 6GB)",
    ram_mb: 6144,
    cpu_cores: 6,
    cpu_category: "6-core mid-range",
    cpu_throttle_rate: 2.0,
    storage_profile: "Standard storage profile",
    storage_capacity_gb: 128,
    storage_available_gb: 48,
    network_profile: "4G",
    network_down_kbps: 9000,
    network_up_kbps: 3000,
    network_latency_ms: 20,
    viewport_width: 412,
    viewport_height: 915,
    device_scale_factor: 2.625,
    is_mobile: true,
    has_touch: true,
    user_agent: "Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
    description: "Emulates balanced mid-range Android hardware (~$350-$450 bracket, e.g. Pixel 7a / Galaxy A54)."
  },
  {
    device_type: "Flagship Android",
    name: "Flagship Android (8-Core, 12GB)",
    ram_mb: 12288,
    cpu_cores: 8,
    cpu_category: "8-core high-performance",
    cpu_throttle_rate: 1.0,
    storage_profile: "High-speed SSD profile",
    storage_capacity_gb: 256,
    storage_available_gb: 128,
    network_profile: "5G",
    network_down_kbps: 30000,
    network_up_kbps: 12000,
    network_latency_ms: 10,
    viewport_width: 412,
    viewport_height: 915,
    device_scale_factor: 3.5,
    is_mobile: true,
    has_touch: true,
    user_agent: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
    description: "Emulates premium flagship Android hardware (~$1000+ bracket, e.g. Galaxy S24 Ultra / Pixel 8 Pro)."
  },
  {
    device_type: "Low-end Desktop",
    name: "Low-end Desktop (2-Core, 4GB)",
    ram_mb: 4096,
    cpu_cores: 2,
    cpu_category: "2-core low-end",
    cpu_throttle_rate: 4.0,
    storage_profile: "Low-speed storage profile",
    storage_capacity_gb: 128,
    storage_available_gb: 20,
    network_profile: "Fast 3G",
    network_down_kbps: 1600,
    network_up_kbps: 750,
    network_latency_ms: 50,
    viewport_width: 1366,
    viewport_height: 768,
    device_scale_factor: 1.0,
    is_mobile: false,
    has_touch: false,
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
    description: "Emulates entry-level Celeron/Athlon office PC or budget Chromebook."
  },
  {
    device_type: "Standard Desktop",
    name: "Standard Desktop (4-Core, 8GB)",
    ram_mb: 8192,
    cpu_cores: 4,
    cpu_category: "4-core budget",
    cpu_throttle_rate: 2.0,
    storage_profile: "Standard storage profile",
    storage_capacity_gb: 256,
    storage_available_gb: 80,
    network_profile: "Wi-Fi",
    network_down_kbps: 25000,
    network_up_kbps: 10000,
    network_latency_ms: 15,
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 1.0,
    is_mobile: false,
    has_touch: false,
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
    description: "Emulates standard enterprise workstation or contemporary home laptop."
  },
  {
    device_type: "High-performance Desktop",
    name: "High-performance Desktop (8-Core, 16GB)",
    ram_mb: 16384,
    cpu_cores: 8,
    cpu_category: "8-core high-performance",
    cpu_throttle_rate: 1.0,
    storage_profile: "NVMe profile",
    storage_capacity_gb: 1024,
    storage_available_gb: 512,
    network_profile: "Wi-Fi",
    network_down_kbps: 100000,
    network_up_kbps: 50000,
    network_latency_ms: 5,
    viewport_width: 1920,
    viewport_height: 1080,
    device_scale_factor: 1.0,
    is_mobile: false,
    has_touch: false,
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 TierLens/1.0",
    description: "Emulates unthrottled high-performance developer / gaming workstation on high-speed connection."
  },
  {
    device_type: "Custom Device",
    name: "Custom Device Profile",
    ram_mb: 4096,
    cpu_cores: 4,
    cpu_category: "Custom",
    cpu_throttle_rate: 1.0,
    storage_profile: "Custom storage profile",
    storage_capacity_gb: 64,
    storage_available_gb: 20,
    network_profile: "Custom network",
    network_down_kbps: 10000,
    network_up_kbps: 5000,
    network_latency_ms: 25,
    viewport_width: 390,
    viewport_height: 844,
    device_scale_factor: 2.0,
    is_mobile: true,
    has_touch: true,
    user_agent: "Mozilla/5.0 (Linux; Android 13; CustomDevice) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 TierLens/1.0",
    description: "User-defined custom device hardware & network profile."
  }
];

const RAM_OPTIONS_MB = [
  { label: "1 GB", mb: 1024 },
  { label: "2 GB", mb: 2048 },
  { label: "3 GB", mb: 3072 },
  { label: "4 GB", mb: 4096 },
  { label: "6 GB", mb: 6144 },
  { label: "8 GB", mb: 8192 },
  { label: "12 GB", mb: 12288 },
  { label: "16 GB", mb: 16384 },
  { label: "32 GB", mb: 32768 },
];

const CPU_PROFILE_EXAMPLES = [
  { label: "2-core low-end (8x slow)", cores: 2, throttle: 8.0, category: "2-core low-end" },
  { label: "4-core budget (4x slow)", cores: 4, throttle: 4.0, category: "4-core budget" },
  { label: "6-core mid-range (2x slow)", cores: 6, throttle: 2.0, category: "6-core mid-range" },
  { label: "8-core high-performance (1x full)", cores: 8, throttle: 1.0, category: "8-core high-performance" },
];

const STORAGE_PROFILES = [
  "Low-speed storage profile",
  "Standard storage profile",
  "High-speed SSD profile",
  "NVMe profile",
  "Custom storage profile"
];

const NETWORK_PROFILES = [
  { name: "Offline", down: 0, up: 0, lat: 0 },
  { name: "Slow 3G", down: 500, up: 250, lat: 200 },
  { name: "Fast 3G", down: 1600, up: 750, lat: 40 },
  { name: "4G", down: 9000, up: 3000, lat: 20 },
  { name: "5G", down: 30000, up: 12000, lat: 10 },
  { name: "Wi-Fi", down: 50000, up: 25000, lat: 5 },
  { name: "Custom network", down: 10000, up: 5000, lat: 30 },
];

const CHART_PALETTE = [
  "#D97745", // Terracotta Primary
  "#557DAA", // Slate/Indigo
  "#36865A", // Warm Forest Green
  "#C58A35", // Warm Amber
  "#B95E32", // Dark Terracotta
  "#8B6A56", // Warm Taupe
  "#7A6F82", // Slate Purple
  "#D28E68", // Soft Terracotta
];

export default function TierLensApp() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigateToTab = (tab: any) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [deviceLabStatus, setDeviceLabStatus] = useState<any>(null);

  // Web Testing Form State
  const [testUrl, setTestUrl] = useState("https://example.com");
  const [selectedTier, setSelectedTier] = useState("BOTH");
  const [testSelectionMode, setTestSelectionMode] = useState<"preset" | "multi_select">("preset");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);

  // Custom Hardware Live Tuning State
  const [customDeviceName, setCustomDeviceName] = useState("Custom Hardware Benchmark");
  const [customRamMb, setCustomRamMb] = useState(2048);
  const [customCpuThrottle, setCustomCpuThrottle] = useState(6.0);
  const [customCpuCores, setCustomCpuCores] = useState(4);
  const [customNetworkPreset, setCustomNetworkPreset] = useState("Slow 3G");
  const [customNetworkLatency, setCustomNetworkLatency] = useState(200);
  const [customNetworkDownKbps, setCustomNetworkDownKbps] = useState(500);
  const [customNetworkUpKbps, setCustomNetworkUpKbps] = useState(250);
  const [customViewport, setCustomViewport] = useState("mobile_budget");

  // Execution State
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testStep, setTestStep] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<{
    job_id: string;
    status: string;
    stage: string;
    progress_message: string;
    error_category?: string | null;
    error?: string | null;
  } | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [graphData, setGraphData] = useState<any>({ nodes: [], edges: [], connected: false });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Device Builder State
  const [savedProfiles, setSavedProfiles] = useState<DeviceProfileData[]>([]);
  const [builderId, setBuilderId] = useState<string | null>(null);
  const [builderDeviceType, setBuilderDeviceType] = useState("Budget Android");
  const [builderName, setBuilderName] = useState("Custom Budget Android");
  const [builderRamMb, setBuilderRamMb] = useState<number>(4096);
  const [isCustomRam, setIsCustomRam] = useState(false);
  const [customRamInput, setCustomRamInput] = useState("");
  const [builderCpuCores, setBuilderCpuCores] = useState<number>(4);
  const [builderCpuThrottle, setBuilderCpuThrottle] = useState<number>(4.0);
  const [builderCpuCategory, setBuilderCpuCategory] = useState("4-core budget");
  const [builderStorageProfile, setBuilderStorageProfile] = useState("Standard storage profile");
  const [builderStorageCapacityGb, setBuilderStorageCapacityGb] = useState<number>(64);
  const [builderStorageAvailableGb, setBuilderStorageAvailableGb] = useState<number>(16);
  const [builderNetworkProfile, setBuilderNetworkProfile] = useState("Fast 3G");
  const [builderNetworkDownKbps, setBuilderNetworkDownKbps] = useState<number>(1600);
  const [builderNetworkUpKbps, setBuilderNetworkUpKbps] = useState<number>(750);
  const [builderNetworkLatencyMs, setBuilderNetworkLatencyMs] = useState<number>(40);
  const [builderNetworkPacketLoss, setBuilderNetworkPacketLoss] = useState<number>(0);
  const [builderViewportWidth, setBuilderViewportWidth] = useState<number>(390);
  const [builderViewportHeight, setBuilderViewportHeight] = useState<number>(844);
  const [builderScaleFactor, setBuilderScaleFactor] = useState<number>(2.5);
  const [builderIsMobile, setBuilderIsMobile] = useState<boolean>(true);
  const [builderHasTouch, setBuilderHasTouch] = useState<boolean>(true);
  const [builderUserAgent, setBuilderUserAgent] = useState<string>("");
  const [builderDescription, setBuilderDescription] = useState<string>("");
  const [builderSuccessMsg, setBuilderSuccessMsg] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // APK Upload State
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [apkManifest, setApkManifest] = useState<any>(null);
  const [isUploadingApk, setIsUploadingApk] = useState(false);

  // Recommendations state
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isCancelling, setIsCancelling] = useState(false);

  // 5 Advanced Features State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditReportData, setAuditReportData] = useState<any>(null);
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [evidenceFailures, setEvidenceFailures] = useState<any[]>([]);
  const [evidenceScreenshot, setEvidenceScreenshot] = useState<string | undefined>(undefined);
  const [evidenceDeviceName, setEvidenceDeviceName] = useState<string>("Target Device");
  const [liveArenaJobId, setLiveArenaJobId] = useState<string | null>(null);

  const handleOpenAuditReport = (data: any) => {
    setAuditReportData(data);
    setIsAuditModalOpen(true);
    if (data) {
      const comp = data.comparison_data || data;
      setComparisonData(comp);
      if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        setRecommendations(data.recommendations);
      } else if (Array.isArray(comp.recommendations) && comp.recommendations.length > 0) {
        setRecommendations(comp.recommendations);
      }
    }
  };

  const handleOpenVisualEvidence = (failuresList: any[], screenshot?: string, devName?: string) => {
    setEvidenceFailures(failuresList);
    setEvidenceScreenshot(screenshot);
    setEvidenceDeviceName(devName || "Target Device");
    setIsEvidenceModalOpen(true);
  };

  const ensureAuth = async () => {
    try {
      const token = ApiClient.getToken();
      if (!token) {
        try {
          const res = await ApiClient.login({ email: "demo@tierlens.com", password: "Password123!" });
          ApiClient.setToken(res.access_token);
        } catch {
          const reg = await ApiClient.register({ email: "demo@tierlens.com", password: "Password123!", full_name: "Demo Developer" });
          ApiClient.setToken(reg.access_token);
        }
      }
    } catch (e) {
      console.warn("Auto demo session initialization notice:", e);
    }
  };

  const DEFAULT_FALLBACK_PROFILES: DeviceProfileData[] = [
    {
      id: "good-budget-default",
      name: "Good Budget Tier (Galaxy A14 / Moto G)",
      tier: "GOOD_BUDGET",
      platform: "WEB",
      device_type: "Smartphone",
      cpu_cores: 4,
      cpu_category: "Mid-Efficiency",
      cpu_throttle_rate: 4.0,
      cpu_slowdown_multiplier: 4.0,
      storage_profile: "eMMC 5.1",
      storage_capacity_gb: 64,
      storage_available_gb: 32,
      network_profile: "Fast 3G",
      network_down_kbps: 1600,
      network_up_kbps: 750,
      network_latency_ms: 150,
      network_packet_loss: 0,
      viewport_width: 390,
      viewport_height: 844,
      device_scale_factor: 2.0,
      is_mobile: true,
      has_touch: true,
      ram_mb: 4096,
      is_custom: false
    },
    {
      id: "entry-level-default",
      name: "Entry-Level Tier (Redmi 9A / Nokia C)",
      tier: "ENTRY_LEVEL",
      platform: "WEB",
      device_type: "Smartphone",
      cpu_cores: 2,
      cpu_category: "Low-Efficiency",
      cpu_throttle_rate: 8.0,
      cpu_slowdown_multiplier: 8.0,
      storage_profile: "eMMC 5.1",
      storage_capacity_gb: 32,
      storage_available_gb: 12,
      network_profile: "Slow 3G",
      network_down_kbps: 400,
      network_up_kbps: 400,
      network_latency_ms: 400,
      network_packet_loss: 0,
      viewport_width: 360,
      viewport_height: 800,
      device_scale_factor: 2.0,
      is_mobile: true,
      has_touch: true,
      ram_mb: 2048,
      is_custom: false
    }
  ];

  const loadProfiles = async () => {
    try {
      const list = await ApiClient.listDeviceProfiles();
      if (Array.isArray(list) && list.length > 0) {
        setSavedProfiles(list);
        if (selectedProfileIds.length === 0 && list.length >= 2) {
          setSelectedProfileIds([list[0].id, list[1].id]);
        }
      } else {
        setSavedProfiles(DEFAULT_FALLBACK_PROFILES);
        if (selectedProfileIds.length === 0) {
          setSelectedProfileIds([DEFAULT_FALLBACK_PROFILES[0].id, DEFAULT_FALLBACK_PROFILES[1].id]);
        }
      }
    } catch (e) {
      console.warn("Could not load device profiles, using fallback presets:", e);
      setSavedProfiles(DEFAULT_FALLBACK_PROFILES);
      if (selectedProfileIds.length === 0) {
        setSelectedProfileIds([DEFAULT_FALLBACK_PROFILES[0].id, DEFAULT_FALLBACK_PROFILES[1].id]);
      }
    }
  };

  const refreshHealth = async () => {
    try {
      const health = await ApiClient.getHealth();
      setSystemHealth(health);
    } catch (e: any) {
      setSystemHealth({
        status: "degraded",
        database: { status: "offline", error: e.message },
        neo4j: { connected: false },
        redis: { connected: false },
        android_adb: { available: false, status: "SETUP_REQUIRED" }
      });
    }

    try {
      const devLab = await ApiClient.getDeviceLabStatus();
      setDeviceLabStatus(devLab);
    } catch (e) {
      // Ignored
    }

    try {
      const gStatus = await ApiClient.getGraphStatus();
      setGraphData((prev: any) => ({ ...prev, connected: gStatus.connected, error: gStatus.error }));
    } catch (e) {
      // Ignored
    }

    try {
      const reports = await ApiClient.getAuditReports({ limit: 1 });
      if (reports && reports.length > 0) {
        const latest = reports[0];
        setComparisonData((prev: any) => prev || latest);
        if (latest.recommendations && latest.recommendations.length > 0) {
          setRecommendations((prev: any[]) => (prev && prev.length > 0 ? prev : latest.recommendations));
        }
      }
    } catch (e) {
      // Ignored
    }
  };

  useEffect(() => {
    ensureAuth().finally(() => {
      refreshHealth();
      loadProfiles();
    });
  }, []);

  const handleApplyPresetTemplate = (template: any) => {
    setBuilderId(null);
    setBuilderDeviceType(template.device_type);
    setBuilderName(template.name);
    setBuilderRamMb(template.ram_mb);
    setIsCustomRam(false);
    setCustomRamInput("");
    setBuilderCpuCores(template.cpu_cores);
    setBuilderCpuThrottle(template.cpu_throttle_rate);
    setBuilderCpuCategory(template.cpu_category);
    setBuilderStorageProfile(template.storage_profile);
    setBuilderStorageCapacityGb(template.storage_capacity_gb);
    setBuilderStorageAvailableGb(template.storage_available_gb);
    setBuilderNetworkProfile(template.network_profile);
    setBuilderNetworkDownKbps(template.network_down_kbps);
    setBuilderNetworkUpKbps(template.network_up_kbps);
    setBuilderNetworkLatencyMs(template.network_latency_ms);
    setBuilderViewportWidth(template.viewport_width);
    setBuilderViewportHeight(template.viewport_height);
    setBuilderScaleFactor(template.device_scale_factor);
    setBuilderIsMobile(template.is_mobile);
    setBuilderHasTouch(template.has_touch);
    setBuilderUserAgent(template.user_agent || "");
    setBuilderDescription(template.description || "");
    setBuilderSuccessMsg(null);
  };

  const handleLoadProfileForEdit = (p: DeviceProfileData) => {
    setBuilderId(p.id);
    setBuilderDeviceType(p.device_type || "Custom Device");
    setBuilderName(p.name);
    setBuilderRamMb(p.ram_mb || 4096);
    setIsCustomRam(!RAM_OPTIONS_MB.some(r => r.mb === p.ram_mb));
    setCustomRamInput(String(Math.round((p.ram_mb || 4096) / 1024)));
    setBuilderCpuCores(p.cpu_cores || 4);
    setBuilderCpuThrottle(p.cpu_throttle_rate || 1.0);
    setBuilderCpuCategory(p.cpu_category || "4-core budget");
    setBuilderStorageProfile(p.storage_profile || "Standard storage profile");
    setBuilderStorageCapacityGb(p.storage_capacity_gb || 64);
    setBuilderStorageAvailableGb(p.storage_available_gb || 16);
    setBuilderNetworkProfile(p.network_profile || "Fast 3G");
    setBuilderNetworkDownKbps(p.network_down_kbps || 1600);
    setBuilderNetworkUpKbps(p.network_up_kbps || 750);
    setBuilderNetworkLatencyMs(p.network_latency_ms || 40);
    setBuilderNetworkPacketLoss(p.network_packet_loss || 0);
    setBuilderViewportWidth(p.viewport_width || 390);
    setBuilderViewportHeight(p.viewport_height || 844);
    setBuilderScaleFactor(p.device_scale_factor || 2.0);
    setBuilderIsMobile(p.is_mobile ?? true);
    setBuilderHasTouch(p.has_touch ?? true);
    setBuilderUserAgent(p.user_agent || "");
    setBuilderDescription(p.description || "");
    setBuilderSuccessMsg(`Loaded profile "${p.name}" for editing.`);
    setActiveTab("device_builder");
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await ensureAuth();
    setIsSavingProfile(true);
    setBuilderSuccessMsg(null);
    setErrorBanner(null);

    const finalRam = isCustomRam && customRamInput
      ? parseInt(customRamInput, 10) * 1024
      : builderRamMb;

    const payload = {
      name: builderName,
      device_type: builderDeviceType,
      ram_mb: finalRam,
      cpu_cores: builderCpuCores,
      cpu_category: builderCpuCategory,
      cpu_throttle_rate: builderCpuThrottle,
      cpu_slowdown_multiplier: builderCpuThrottle,
      storage_profile: builderStorageProfile,
      storage_capacity_gb: builderStorageCapacityGb,
      storage_available_gb: builderStorageAvailableGb,
      network_profile: builderNetworkProfile,
      network_down_kbps: builderNetworkDownKbps,
      network_up_kbps: builderNetworkUpKbps,
      network_latency_ms: builderNetworkLatencyMs,
      network_packet_loss: builderNetworkPacketLoss,
      viewport_width: builderViewportWidth,
      viewport_height: builderViewportHeight,
      device_scale_factor: builderScaleFactor,
      is_mobile: builderIsMobile,
      has_touch: builderHasTouch,
      user_agent: builderUserAgent,
      description: builderDescription
    };

    try {
      if (builderId && savedProfiles.find(p => p.id === builderId)?.is_custom) {
        await ApiClient.updateDeviceProfile(builderId, payload);
        setBuilderSuccessMsg(`Profile "${builderName}" updated successfully in Neon PostgreSQL!`);
      } else {
        const created = await ApiClient.createDeviceProfile(payload);
        setBuilderId(created.id);
        setBuilderSuccessMsg(`New profile "${builderName}" created and persisted to Neon PostgreSQL!`);
      }
      await loadProfiles();
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to save device profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDuplicateProfile = async (id: string) => {
    try {
      await ensureAuth();
      const cloned = await ApiClient.duplicateDeviceProfile(id);
      await loadProfiles();
      handleLoadProfileForEdit(cloned);
      setBuilderSuccessMsg(`Duplicated profile into "${cloned.name}".`);
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to duplicate profile.");
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm("Are you sure you want to deactivate this custom device profile?")) return;
    try {
      await ensureAuth();
      await ApiClient.deleteDeviceProfile(id);
      await loadProfiles();
      if (builderId === id) setBuilderId(null);
      setBuilderSuccessMsg("Profile deactivated.");
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to delete profile.");
    }
  };

  const toggleSelectProfileForTest = (id: string) => {
    setSelectedProfileIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCancelJob = async () => {
    if (!activeJob || isCancelling) return;
    setIsCancelling(true);
    try {
      await ApiClient.cancelWebJob(activeJob.job_id);
      setTestStep("Cancellation requested...");
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to cancel job.");
      setIsCancelling(false);
    }
  };

  const handleExecuteWebTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl) return;

    await ensureAuth();
    setErrorBanner(null);
    setIsRunningTest(true);
    setTestStep("Submitting test to background execution queue...");

    try {
      const payload: any = {
        target_url: testUrl,
      };

      if (testSelectionMode === "multi_select") {
        if (selectedProfileIds.length === 0) {
          throw new Error("Please select at least one device profile configuration for testing.");
        }
        payload.device_profile_ids = selectedProfileIds;
      } else if (selectedTier === "CUSTOM") {
        const vp = customViewport === "mobile_budget" ? { width: 360, height: 800 } :
                   customViewport === "mobile_standard" ? { width: 390, height: 844 } :
                   customViewport === "tablet" ? { width: 768, height: 1024 } : { width: 1366, height: 768 };
        payload.custom_profiles = [{
          name: customDeviceName || "Custom Parameter Config",
          tier: "CUSTOM",
          device_type: "Custom Device",
          ram_mb: Number(customRamMb),
          cpu_cores: Number(customCpuCores),
          cpu_throttle_rate: Number(customCpuThrottle),
          network_profile: customNetworkPreset,
          network_down_kbps: Number(customNetworkDownKbps),
          network_up_kbps: Number(customNetworkUpKbps),
          network_latency_ms: Number(customNetworkLatency),
          viewport_width: vp.width,
          viewport_height: vp.height,
          device_scale_factor: customViewport.startsWith("mobile") ? 2.0 : 1.0,
          is_mobile: !customViewport.startsWith("desktop"),
          has_touch: !customViewport.startsWith("desktop"),
          storage_capacity_gb: 32,
          storage_profile: "Custom Profile"
        }];
      } else {
        payload.tier = selectedTier;
      }

      const queueRes = await ApiClient.runWebTest(payload);
      const jobId = queueRes.job_id;
      setActiveJob({
        job_id: jobId,
        status: queueRes.status || "QUEUED",
        stage: queueRes.stage || "Queue Dispatch",
        progress_message: queueRes.message || "Job accepted for execution.",
      });
      setTestStep(`[${queueRes.status || "QUEUED"}] ${queueRes.message || "Job accepted"}`);

      let finished = false;
      let pollCount = 0;
      const MAX_POLLS = 100;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 3;

      while (!finished && pollCount < MAX_POLLS) {
        await new Promise(r => setTimeout(r, 1500));
        pollCount++;

        try {
          const statusRes = await ApiClient.getWebJobStatus(jobId);
          consecutiveErrors = 0;
          setActiveJob(statusRes);
          setTestStep(`[${statusRes.status}] ${statusRes.stage}: ${statusRes.progress_message}`);

          if (["COMPLETED", "COMPLETED_WITH_WARNINGS", "PARTIAL"].includes(statusRes.status)) {
            finished = true;
            setTestResult(statusRes);

            const compGroupId = statusRes.comparison_group_id || jobId;
            if (statusRes.mode === "MULTI_COMPARISON" || statusRes.mode === "DUAL_COMPARISON" || statusRes.comparison_data) {
              try {
                setTestStep("Retrieving multi-configuration performance comparison...");
                const comp = statusRes.comparison_data || await ApiClient.getComparison(compGroupId);
                setComparisonData(comp);

                if (comp.recommendations) {
                  setRecommendations(comp.recommendations);
                }

                const targetProjId = statusRes.project_id || comp.runs?.[0]?.project_id || comp.entry_level_run?.project_id;
                if (targetProjId) {
                  const g = await ApiClient.getProjectGraph(targetProjId);
                  setGraphData(g);
                }
              } catch (loadErr) {
                console.warn("Could not load external comparison endpoints:", loadErr);
              }
            } else if (statusRes.single_run_id || statusRes.test_run_id) {
              const runId = statusRes.single_run_id || statusRes.test_run_id;
              try {
                setTestStep("Loading recommendations...");
                const recs = statusRes.recommendations || await ApiClient.getRunRecommendations(runId);
                setRecommendations(recs);
                if (statusRes.project_id) {
                  const g = await ApiClient.getProjectGraph(statusRes.project_id);
                  setGraphData(g);
                }
              } catch (loadErr) {
                console.warn("Could not load recommendations:", loadErr);
              }
            }

            if (statusRes.status === "PARTIAL") {
              setErrorBanner(`[PARTIAL EXECUTION] ${statusRes.progress_message}`);
            }
          } else if (statusRes.status === "FAILED") {
            finished = true;
            setTestResult(statusRes);
            const errMsg = statusRes.error_category
              ? `[${statusRes.error_category}] ${statusRes.progress_message || statusRes.error}`
              : (statusRes.error || statusRes.progress_message || "Execution halted.");
            setErrorBanner(errMsg);
          } else if (statusRes.status === "CANCELLED") {
            finished = true;
            setErrorBanner("Test execution was cancelled by user.");
          }
        } catch (err: any) {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS || err.message?.includes("failed")) {
            throw err;
          }
        }
      }
    } catch (err: any) {
      setErrorBanner(err.message || "Failed to execute test.");
    } finally {
      setIsRunningTest(false);
      setIsCancelling(false);
      setTestStep(null);
    }
  };

  const handleApkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setApkFile(file);
    setIsUploadingApk(true);
    setErrorBanner(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      await ensureAuth();
      const res = await ApiClient.uploadApk(formData);
      setApkManifest(res.manifest);
    } catch (err: any) {
      setErrorBanner(err.message);
    } finally {
      setIsUploadingApk(false);
    }
  };

  // Synthesize robust metrics diff directly from multi_metrics_diff or individual run metrics
  const effectiveMetricsDiff = useMemo(() => {
    if (comparisonData?.multi_metrics_diff && Object.keys(comparisonData.multi_metrics_diff).length > 0) {
      return comparisonData.multi_metrics_diff;
    }
    if (comparisonData?.runs && comparisonData.runs.length > 0) {
      const diff: Record<string, any> = {};
      const runProfiles = comparisonData.runs.map((r: any) => ({
        name: r.device_profile?.name || (r.tier === "GOOD_BUDGET" ? "Good Budget Tier (Galaxy A14 / Moto G)" : "Entry-Level Tier (Redmi 9A / Nokia C)"),
        metrics: (r.metrics || []).reduce((acc: any, m: any) => {
          acc[m.name] = { value: m.value, unit: m.unit };
          return acc;
        }, {})
      }));
      const allMetricNames = new Set<string>();
      runProfiles.forEach((rp: any) => Object.keys(rp.metrics).forEach(k => allMetricNames.add(k)));

      allMetricNames.forEach(mName => {
        const values: Record<string, number> = {};
        let unit = "";
        runProfiles.forEach((rp: any) => {
          if (rp.metrics[mName]) {
            values[rp.name] = rp.metrics[mName].value;
            unit = rp.metrics[mName].unit;
          }
        });
        const numeric = Object.values(values);
        const baseline = numeric.length > 0 ? numeric[0] : 0;
        const degradations_pct: Record<string, number> = {};
        Object.entries(values).forEach(([pName, val]) => {
          if (baseline > 0 && val > baseline) {
            degradations_pct[pName] = Math.round(((val - baseline) / baseline) * 100);
          }
        });
        diff[mName] = { unit, values, degradations_pct };
      });
      return diff;
    }
    return null;
  }, [comparisonData]);

  // Construct dynamic Recharts chart data across all tested configurations
  const comparisonChartData = useMemo(() => {
    const diff = effectiveMetricsDiff || comparisonData?.multi_metrics_diff;
    if (diff && Object.keys(diff).length > 0) {
      return Object.entries(diff).map(([key, val]: [string, any]) => {
        const row: any = { name: key, unit: val.unit };
        if (val.values) {
          Object.entries(val.values).forEach(([pName, pVal]) => {
            row[pName] = pVal;
          });
        }
        return row;
      });
    }
    if (comparisonData?.metrics_diff && Object.keys(comparisonData.metrics_diff).length > 0) {
      return Object.entries(comparisonData.metrics_diff).map(([key, val]: [string, any]) => ({
        name: key,
        "Good Budget": val.good_budget,
        "Entry-Level": val.entry_level,
        unit: val.unit,
      }));
    }
    return [];
  }, [comparisonData, effectiveMetricsDiff]);

  const profileKeysInChart = useMemo(() => {
    const keys = new Set<string>();
    if (comparisonChartData.length > 0) {
      comparisonChartData.forEach((row: any) => {
        Object.keys(row).forEach(k => {
          if (k !== "name" && k !== "unit") {
            keys.add(k);
          }
        });
      });
    }
    if (keys.size === 0 && comparisonData?.configurations && comparisonData.configurations.length > 0) {
      comparisonData.configurations.forEach((c: any) => keys.add(c.name));
    }
    if (keys.size === 0 && comparisonData?.runs && comparisonData.runs.length > 0) {
      comparisonData.runs.forEach((r: any) => keys.add(r.device_profile?.name || (r.tier === "GOOD_BUDGET" ? "Good Budget Tier (Galaxy A14 / Moto G)" : "Entry-Level Tier (Redmi 9A / Nokia C)")));
    }
    return Array.from(keys);
  }, [comparisonChartData, comparisonData]);

  return (
    <div className="flex h-screen bg-[#F5F3EE] text-[#252525] font-sans overflow-hidden">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR NAVIGATION */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#F0EEE8] border-r border-[#E6E2D9] flex flex-col justify-between shrink-0 select-none transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
        mobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}>
        <div>
          {/* Logo */}
          <div className="p-4 border-b border-[#E6E2D9] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#D97745] flex items-center justify-center text-white shadow-warm">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-tight text-[#252525] flex items-center gap-1.5">
                  TierLens <span className="text-[10px] bg-[#F8E9DF] text-[#D97745] border border-[#F1D5C4] px-1.5 py-0.5 rounded font-mono font-semibold">v2.0</span>
                </h1>
                <p className="text-[11px] text-[#6B6B65]">Performance Engineering</p>
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1 rounded-lg text-[#96948D] hover:text-[#252525] lg:hidden"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            <div className="text-[10px] font-semibold text-[#96948D] uppercase px-3 py-1.5 tracking-wider">
              Simulation & Testing
            </div>
            <button
              onClick={() => navigateToTab("overview")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "overview" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Activity className="w-4 h-4 text-[#D97745]" />
              Main Dashboard
            </button>
            <button
              onClick={() => navigateToTab("web_test")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "web_test" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Globe className="w-4 h-4 text-[#D97745]" />
              Website Testing
            </button>
            <button
              onClick={() => navigateToTab("live_arena")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "live_arena" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Terminal className="w-4 h-4 text-[#D97745]" />
              Live Testing Arena
            </button>
            <button
              onClick={() => navigateToTab("device_builder")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "device_builder" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Sliders className="w-4 h-4 text-[#D97745]" />
              Device Config Builder
            </button>
            <button
              onClick={() => navigateToTab("android_test")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "android_test" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Smartphone className="w-4 h-4 text-[#36865A]" />
              Android APK Testing
            </button>
            <button
              onClick={() => navigateToTab("device_lab")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "device_lab" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Radio className="w-4 h-4 text-purple-400" />
              Device Lab & Tiers
            </button>

            <div className="text-[10px] font-semibold text-[#96948D] uppercase px-3 pt-4 pb-1.5 tracking-wider">
              Comparison & Analysis
            </div>
            <button
              onClick={() => navigateToTab("compare")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "compare" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <GitCompare className="w-4 h-4 text-[#D97745]" />
              Device Comparison
            </button>
            <button
              onClick={() => navigateToTab("failures")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "failures" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <AlertOctagon className="w-4 h-4 text-[#C6534B]" />
              Failure Explorer
            </button>
            <button
              onClick={() => navigateToTab("rca")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "rca" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Brain className="w-4 h-4 text-pink-400" />
              Root Cause Analysis
            </button>
            <button
              onClick={() => navigateToTab("graph")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "graph" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Database className="w-4 h-4 text-[#D97745]" />
              Intelligence Explorer
            </button>
            <button
              onClick={() => navigateToTab("reports")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "reports" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <FileText className="w-4 h-4 text-[#D97745]" />
              Audit Reports
            </button>

            <div className="text-[10px] font-semibold text-[#96948D] uppercase px-3 pt-4 pb-1.5 tracking-wider">
              Governance & Runbooks
            </div>
            <button
              onClick={() => navigateToTab("settings")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "settings" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <Settings className="w-4 h-4 text-[#6B6B65]" />
              Settings
            </button>
            <button
              onClick={() => navigateToTab("docs")}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-warm active:scale-[0.98] ${
                activeTab === "docs" ? "bg-[#F8E9DF] text-[#D97745] border-l-2 border-[#D97745] font-semibold pl-2.5 shadow-sm" : "text-[#6B6B65] hover:bg-[#EAE7DF] hover:text-[#252525]"
              }`}
            >
              <BookOpen className="w-4 h-4 text-[#6B6B65]" />
              Documentation
            </button>
          </nav>
        </div>

        {/* Real Data Policy Indicator */}
        <div className="p-3 border-t border-[#E6E2D9] bg-[#EEECE5]">
          <div className="flex items-center gap-2 text-[10px] text-[#36865A] font-semibold mb-1">
            <span className="w-2 h-2 rounded-full bg-[#36865A] animate-pulse" />
            <span>Real Data Policy: STRICT</span>
          </div>
          <p className="text-[9px] text-[#6B6B65] leading-tight">
            Zero fabricated results. Browser tests run via real Playwright/CDP; DB runs on Neon PostgreSQL.
          </p>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#F5F3EE]">
        {/* TOP STATUS BAR */}
        <header className="h-14 lg:h-12 border-b border-[#E6E2D9] bg-[#FFFFFF]/95 backdrop-blur px-3 sm:px-6 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 text-xs overflow-x-auto py-1">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 -ml-1 rounded-lg text-[#6B6B65] hover:bg-[#EEECE5] lg:hidden shrink-0"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-[#252525] hidden sm:inline text-xs">Environment:</span>
            <span className="px-2 py-0.5 rounded bg-[#EBF5F0] text-[#36865A] border border-[#CDE5D8] font-mono text-[10px] font-semibold whitespace-nowrap flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#36865A]" />
              PostgreSQL Connected
            </span>
            <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold whitespace-nowrap flex items-center gap-1.5 ${
              systemHealth?.neo4j?.connected
                ? "bg-[#EBF5F0] text-[#36865A] border border-[#CDE5D8]"
                : "bg-[#EEECE5] text-[#6B6B65] border border-[#E6E2D9]"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${systemHealth?.neo4j?.connected ? "bg-[#36865A]" : "bg-[#96948D]"}`} />
              Neo4j: {systemHealth?.neo4j?.connected ? "Online" : "Fallback Active"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { refreshHealth(); loadProfiles(); }}
              className="text-[11px] text-[#6B6B65] hover:text-[#252525] flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#EEECE5] hover:bg-[#EAE7DF] border border-[#E6E2D9] transition-warm active:scale-95 font-medium group"
            >
              <RefreshCw className="w-3 h-3 text-[#D97745] group-hover:rotate-180 transition-transform duration-500" /> Refresh Diagnostics
            </button>
          </div>
        </header>

        {/* ERROR / NOTIFICATION BANNER */}
        {errorBanner && (
          <div className="bg-[#FBEBEA] border-b border-[#F5C6C3] px-6 py-2.5 text-xs text-[#C6534B] flex items-center justify-between animate-banner-enter">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-[#C6534B] shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button onClick={() => setErrorBanner(null)} className="text-[#C6534B] hover:text-[#252525] active:scale-95 transition-transform">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* SCROLLABLE VIEW CONTAINER */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">

          {/* ========================================================================= */}
          {/* TAB: OVERVIEW */}
          {/* ========================================================================= */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-tab-enter">
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-[#252525] flex items-center gap-2">
                      <Layers className="w-5 h-5 text-[#D97745]" />
                      TierLens Configurable Device Performance Platform
                    </h2>
                    <p className="text-xs text-[#6B6B65] mt-1 max-w-3xl">
                      Define custom virtual device profiles with controlled CPU throttling, network latency/bandwidth,
                      viewport parameters, and analytical RAM/storage specifications. Test your website against multiple
                      configurations and measure real performance degradations side by side.
                    </p>
                  </div>
                  <button
                    onClick={() => navigateToTab("device_builder")}
                    className="px-4 py-2 bg-[#D97745] hover:bg-[#B95E32] text-white shadow-warm font-medium text-xs rounded-lg transition-warm active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Configure Device
                  </button>
                </div>

                {/* Quick Action Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div
                    onClick={() => navigateToTab("web_test")}
                    className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] hover:border-[#D97745]/50 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Globe className="w-5 h-5 text-[#D97745]" />
                      <ChevronRight className="w-4 h-4 text-[#6B6B65] group-hover:text-[#D97745] group-hover:translate-x-1 transition-all duration-200" />
                    </div>
                    <div className="font-semibold text-xs text-[#252525]">Execute Multi-Device Web Test</div>
                    <p className="text-[11px] text-[#6B6B65] mt-1">
                      Run automated Playwright tests with Chrome DevTools Protocol CPU & network conditions.
                    </p>
                  </div>

                  <div
                    onClick={() => navigateToTab("device_builder")}
                    className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] hover:border-[#D97745]/50 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Sliders className="w-5 h-5 text-[#D97745]" />
                      <ChevronRight className="w-4 h-4 text-[#6B6B65] group-hover:text-[#D97745] group-hover:translate-x-1 transition-all duration-200" />
                    </div>
                    <div className="font-semibold text-xs text-[#252525]">Device Configuration Builder</div>
                    <p className="text-[11px] text-[#6B6B65] mt-1">
                      Customize RAM profiles, CPU throttling, storage parameters, and network presets.
                    </p>
                  </div>

                  <div
                    onClick={() => navigateToTab("compare")}
                    className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] hover:border-[#36865A]/50 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <GitCompare className="w-5 h-5 text-[#36865A]" />
                      <ChevronRight className="w-4 h-4 text-[#6B6B65] group-hover:text-[#36865A] group-hover:translate-x-1 transition-all duration-200" />
                    </div>
                    <div className="font-semibold text-xs text-[#252525]">Performance Comparison</div>
                    <p className="text-[11px] text-[#6B6B65] mt-1">
                      Side-by-side degradations, Core Web Vitals diff, best vs worst performing configuration.
                    </p>
                  </div>
                </div>
              </div>

              {/* Saved Profiles Snapshot */}
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#252525] flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-[#D97745]" />
                      Configured Device Profiles ({savedProfiles.length})
                    </h3>
                    <p className="text-[11px] text-[#6B6B65] mt-0.5">
                      Hardware & network specifications ready for testing.
                    </p>
                  </div>
                  <button
                    onClick={() => navigateToTab("device_builder")}
                    className="text-xs text-[#D97745] hover:text-[#B95E32] font-semibold flex items-center gap-1 group active:scale-95 transition-all"
                  >
                    Manage Profiles <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform duration-200" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {savedProfiles.slice(0, 6).map((p) => (
                    <div key={p.id} className="p-3.5 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] space-y-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#252525] truncate max-w-[180px]">{p.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                          p.is_custom ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-[#F8E9DF] text-[#D97745] border border-[#F1D5C4]"
                        }`}>
                          {p.is_custom ? "CUSTOM" : "PRESET"}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#6B6B65] space-y-0.5 font-mono">
                        <div>CPU: {p.cpu_cores} Cores • {p.cpu_throttle_rate}x Slowdown</div>
                        <div>RAM: {Math.round(p.ram_mb / 1024)} GB • Storage: {p.storage_capacity_gb} GB</div>
                        <div>Network: {p.network_profile} ({p.network_latency_ms}ms lat)</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DEVICE CONFIGURATION BUILDER */}
          {/* ========================================================================= */}
          {activeTab === "device_builder" && (
            <div className="space-y-6 animate-tab-enter">
              {/* Header Card */}
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-[#252525] flex items-center gap-2">
                      <Sliders className="w-5 h-5 text-[#D97745]" />
                      Custom Device Configuration Builder
                    </h2>
                    <p className="text-xs text-[#6B6B65] mt-0.5">
                      Configure custom virtual hardware, CPU throttling, storage specifications, and network conditions.
                    </p>
                  </div>
                  {builderSuccessMsg && (
                    <div className="px-3 py-1.5 rounded bg-emerald-500/10 border border-[#36865A]/30 text-emerald-300 text-xs flex items-center gap-1.5 animate-banner-enter">
                      <CheckCircle2 className="w-4 h-4 text-[#36865A] shrink-0" />
                      <span>{builderSuccessMsg}</span>
                    </div>
                  )}
                </div>

                {/* Quick Presets Picker */}
                <div className="mt-5 pt-4 border-t border-[#E6E2D9]">
                  <span className="text-[11px] font-semibold text-[#6B6B65] block mb-2">
                    Quick Preset Templates (click to populate):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.name}
                        type="button"
                        onClick={() => handleApplyPresetTemplate(tpl)}
                        className={`px-2.5 py-1 rounded text-xs transition-warm active:scale-95 border ${
                          builderName === tpl.name
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                            : "bg-[#FAF9F6] text-[#252525] border-[#E6E2D9] hover:border-slate-500"
                        }`}
                      >
                        {tpl.device_type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Builder Form */}
                <form onSubmit={handleSaveProfile} className="mt-6 space-y-6">
                  {/* Row 1: Profile Identification */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#252525] mb-1">Device Profile Name</label>
                      <input
                        type="text"
                        value={builderName}
                        onChange={e => setBuilderName(e.target.value)}
                        required
                        placeholder="e.g. Redmi 9A Constrained (Entry Android)"
                        className="w-full bg-white border border-[#D8D4C9] rounded-lg px-3 py-2 text-xs text-[#252525] shadow-sm focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#252525] mb-1">Device Type</label>
                      <select
                        value={builderDeviceType}
                        onChange={e => setBuilderDeviceType(e.target.value)}
                        className="w-full bg-white border border-[#D8D4C9] rounded-lg px-3 py-2 text-xs text-[#252525] shadow-sm focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Entry-level Android">Entry-level Android</option>
                        <option value="Budget Android">Budget Android</option>
                        <option value="Mid-range Android">Mid-range Android</option>
                        <option value="Flagship Android">Flagship Android</option>
                        <option value="Low-end Desktop">Low-end Desktop</option>
                        <option value="Standard Desktop">Standard Desktop</option>
                        <option value="High-performance Desktop">High-performance Desktop</option>
                        <option value="Custom Device">Custom Device</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 2: RAM Configuration */}
                  <div className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-[#D97745]" />
                        <span className="text-xs font-bold text-[#252525]">RAM Configuration</span>
                      </div>
                      <span className="text-[10px] text-[#6B6B65] font-mono">
                        Selected: {Math.round(builderRamMb / 1024)} GB ({builderRamMb} MB)
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {RAM_OPTIONS_MB.map(opt => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => { setBuilderRamMb(opt.mb); setIsCustomRam(false); }}
                          className={`px-3 py-1.5 rounded text-xs font-mono transition border ${
                            builderRamMb === opt.mb && !isCustomRam
                              ? "bg-[#D97745] text-white border-[#D97745] font-semibold"
                              : "bg-[#FAF9F6] text-[#252525] border-[#E6E2D9] hover:border-slate-500"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setIsCustomRam(true)}
                        className={`px-3 py-1.5 rounded text-xs font-mono transition border ${
                          isCustomRam
                            ? "bg-[#D97745] text-white border-[#D97745] font-semibold"
                            : "bg-[#FAF9F6] text-[#252525] border-[#E6E2D9] hover:border-slate-500"
                        }`}
                      >
                        Custom RAM
                      </button>
                    </div>

                    {isCustomRam && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="128"
                          value={customRamInput}
                          onChange={e => {
                            setCustomRamInput(e.target.value);
                            const parsed = parseInt(e.target.value, 10);
                            if (parsed > 0) setBuilderRamMb(parsed * 1024);
                          }}
                          placeholder="Enter RAM in GB (e.g. 5)"
                          className="w-48 bg-white border border-[#D8D4C9] rounded px-2.5 py-1 text-xs text-[#252525] shadow-sm font-mono"
                        />
                        <span className="text-xs text-[#6B6B65]">GB</span>
                      </div>
                    )}
                    <div className="text-[10px] text-[#6B6B65] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-[#D97745] shrink-0" />
                      <span>
                        Technical Transparency: RAM allocation is recorded as target device specification metadata for correlation.
                        Browser engines cannot artificially restrict physical host system RAM.
                      </span>
                    </div>
                  </div>

                  {/* Row 3: CPU Configuration */}
                  <div className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-[#36865A]" />
                        <span className="text-xs font-bold text-[#252525]">CPU Specifications & Throttling</span>
                      </div>
                      <span className="text-[10px] text-[#6B6B65] font-mono">
                        Throttle: {builderCpuThrottle}x Slowdown • {builderCpuCores} Physical Profile Cores
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">CPU Core Count Profile</label>
                        <select
                          value={builderCpuCores}
                          onChange={e => setBuilderCpuCores(parseInt(e.target.value, 10))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        >
                          <option value={2}>2 Cores (Low-end entry)</option>
                          <option value={4}>4 Cores (Budget standard)</option>
                          <option value={6}>6 Cores (Mid-range mobile)</option>
                          <option value={8}>8 Cores (High-performance flagship)</option>
                          <option value={12}>12 Cores (Workstation)</option>
                          <option value={16}>16 Cores (High-end desktop)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">
                          CPU Slowdown Multiplier (CDP Throttling Rate: {builderCpuThrottle}x)
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="12"
                          step="0.5"
                          value={builderCpuThrottle}
                          onChange={e => setBuilderCpuThrottle(parseFloat(e.target.value))}
                          className="w-full accent-indigo-500 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-[#6B6B65] font-mono">
                          <span>1x (No throttle)</span>
                          <span>4x (Budget)</span>
                          <span>8x (Entry)</span>
                          <span>12x (Max)</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Performance Category</label>
                        <input
                          type="text"
                          value={builderCpuCategory}
                          onChange={e => setBuilderCpuCategory(e.target.value)}
                          placeholder="e.g. 4-core budget"
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-[#6B6B65] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-[#36865A] shrink-0" />
                      <span>
                        Real Emulation: CPU throttling factor ({builderCpuThrottle}x) is directly enforced via Chrome DevTools Protocol
                        (Emulation.setCPUThrottlingRate). Physical core allocation represents analytical target metadata.
                      </span>
                    </div>
                  </div>

                  {/* Row 4: Storage Configuration */}
                  <div className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold text-[#252525]">Storage Profile & Capacity</span>
                      </div>
                      <span className="text-[10px] text-[#6B6B65] font-mono">
                        {builderStorageProfile} ({builderStorageCapacityGb}GB total, {builderStorageAvailableGb}GB free)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Storage Profile Type</label>
                        <select
                          value={builderStorageProfile}
                          onChange={e => setBuilderStorageProfile(e.target.value)}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm"
                        >
                          {STORAGE_PROFILES.map(sp => (
                            <option key={sp} value={sp}>{sp}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Total Storage Capacity (GB)</label>
                        <input
                          type="number"
                          min="8"
                          max="4096"
                          value={builderStorageCapacityGb}
                          onChange={e => setBuilderStorageCapacityGb(parseInt(e.target.value, 10))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Available Free Space (GB)</label>
                        <input
                          type="number"
                          min="1"
                          max={builderStorageCapacityGb}
                          value={builderStorageAvailableGb}
                          onChange={e => setBuilderStorageAvailableGb(parseInt(e.target.value, 10))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-[#6B6B65] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>
                        Technical Transparency: Browser automation cannot modify the host machine's physical storage hardware or emulate
                        an actual SSD/eMMC bus controller. Storage parameters are tracked as controlled test metadata.
                      </span>
                    </div>
                  </div>

                  {/* Row 5: Network Configuration */}
                  <div className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wifi className="w-4 h-4 text-[#C58A35]" />
                        <span className="text-xs font-bold text-[#252525]">Network Conditions & Latency</span>
                      </div>
                      <span className="text-[10px] text-[#6B6B65] font-mono">
                        {builderNetworkProfile} • Latency: {builderNetworkLatencyMs}ms • Down: {builderNetworkDownKbps} kbps
                      </span>
                    </div>

                    {/* Network Presets */}
                    <div className="flex flex-wrap gap-2">
                      {NETWORK_PROFILES.map(np => (
                        <button
                          key={np.name}
                          type="button"
                          onClick={() => {
                            setBuilderNetworkProfile(np.name);
                            setBuilderNetworkDownKbps(np.down);
                            setBuilderNetworkUpKbps(np.up);
                            setBuilderNetworkLatencyMs(np.lat);
                          }}
                          className={`px-2.5 py-1 rounded text-xs transition border ${
                            builderNetworkProfile === np.name
                              ? "bg-amber-600 text-white border-amber-500 font-semibold"
                              : "bg-[#FAF9F6] text-[#252525] border-[#E6E2D9] hover:border-slate-500"
                          }`}
                        >
                          {np.name}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Download Bandwidth (kbps)</label>
                        <input
                          type="number"
                          min="0"
                          value={builderNetworkDownKbps}
                          onChange={e => setBuilderNetworkDownKbps(parseFloat(e.target.value))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Upload Bandwidth (kbps)</label>
                        <input
                          type="number"
                          min="0"
                          value={builderNetworkUpKbps}
                          onChange={e => setBuilderNetworkUpKbps(parseFloat(e.target.value))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Network Latency (RTT ms)</label>
                        <input
                          type="number"
                          min="0"
                          max="5000"
                          value={builderNetworkLatencyMs}
                          onChange={e => setBuilderNetworkLatencyMs(parseInt(e.target.value, 10))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-[#6B6B65] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-[#C58A35] shrink-0" />
                      <span>
                        Real Emulation: Network throttling and latency are directly simulated in Chromium via Chrome DevTools Protocol
                        (Network.emulateNetworkConditions).
                      </span>
                    </div>
                  </div>

                  {/* Row 6: Viewport & Emulation Details */}
                  <div className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-[#252525]">Viewport & Browser Emulation</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Viewport Width (px)</label>
                        <input
                          type="number"
                          min="240"
                          max="3840"
                          value={builderViewportWidth}
                          onChange={e => setBuilderViewportWidth(parseInt(e.target.value, 10))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Viewport Height (px)</label>
                        <input
                          type="number"
                          min="240"
                          max="2160"
                          value={builderViewportHeight}
                          onChange={e => setBuilderViewportHeight(parseInt(e.target.value, 10))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#252525] mb-1">Pixel Scale Factor</label>
                        <input
                          type="number"
                          step="0.25"
                          min="1"
                          max="4"
                          value={builderScaleFactor}
                          onChange={e => setBuilderScaleFactor(parseFloat(e.target.value))}
                          className="w-full bg-white border border-[#D8D4C9] rounded px-2.5 py-1.5 text-xs text-[#252525] shadow-sm font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-4 pt-4">
                        <label className="flex items-center gap-1.5 text-xs text-[#252525] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={builderIsMobile}
                            onChange={e => setBuilderIsMobile(e.target.checked)}
                            className="rounded accent-indigo-500"
                          />
                          Mobile
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-[#252525] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={builderHasTouch}
                            onChange={e => setBuilderHasTouch(e.target.checked)}
                            className="rounded accent-indigo-500"
                          />
                          Touch
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#252525] mb-1">Custom User-Agent (optional)</label>
                      <input
                        type="text"
                        value={builderUserAgent}
                        onChange={e => setBuilderUserAgent(e.target.value)}
                        placeholder="Leave blank for automatic user agent"
                        className="w-full bg-[#FAF9F6] border border-[#E6E2D9] rounded px-2.5 py-1.5 text-xs text-[#252525] font-mono"
                      />
                    </div>
                  </div>

                  {/* Submit / Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => handleApplyPresetTemplate(PRESET_TEMPLATES[0])}
                      className="px-4 py-2 bg-[#EEECE5] hover:bg-[#EAE7DF] text-[#252525] text-xs rounded-lg transition-warm active:scale-95"
                    >
                      Reset Form to Default Preset
                    </button>

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={isSavingProfile}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition-warm active:scale-[0.98] flex items-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                      >
                        {isSavingProfile ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {builderId && savedProfiles.find(p => p.id === builderId)?.is_custom ? "Update Custom Profile" : "Save as New Custom Profile"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Saved Configurations Library */}
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#252525] flex items-center gap-2">
                      <Database className="w-4 h-4 text-[#D97745]" />
                      All Device Configurations ({savedProfiles.length})
                    </h3>
                    <p className="text-[11px] text-[#6B6B65] mt-0.5">
                      System presets and custom workspace profiles stored in Neon PostgreSQL.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedProfiles.map(p => (
                    <div
                      key={p.id}
                      className={`p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        builderId === p.id
                          ? "bg-[#131F3A] border-indigo-500 text-white"
                          : "bg-[#FAF9F6] border-[#E6E2D9] hover:border-[#D97745]/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-[#252525]">{p.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                              p.is_custom ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-[#F8E9DF] text-[#D97745] border border-[#F1D5C4]"
                            }`}>
                              {p.is_custom ? "CUSTOM" : "PRESET"}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#6B6B65] font-mono block mt-0.5">
                            {p.device_type}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#E6E2D9] text-[10px] font-mono text-[#252525]">
                        <div>RAM: <span className="text-white font-semibold">{Math.round(p.ram_mb / 1024)} GB</span></div>
                        <div>CPU: <span className="text-white font-semibold">{p.cpu_cores} Cores ({p.cpu_throttle_rate}x)</span></div>
                        <div>Net: <span className="text-white font-semibold">{p.network_profile}</span></div>
                        <div>Storage: <span className="text-white font-semibold">{p.storage_capacity_gb} GB</span></div>
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#E6E2D9]">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProfileIds([p.id]);
                            setTestSelectionMode("multi_select");
                            setActiveTab("web_test");
                          }}
                          className="text-[10px] text-[#D97745] hover:text-blue-300 font-semibold flex items-center gap-1"
                        >
                          <Play className="w-3 h-3 fill-current" /> Test Website
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleLoadProfileForEdit(p)}
                            title="Edit / Load into builder"
                            className="p-1 text-[#6B6B65] hover:text-[#252525]"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateProfile(p.id)}
                            title="Duplicate profile"
                            className="p-1 text-[#6B6B65] hover:text-[#252525]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {p.is_custom && (
                            <button
                              type="button"
                              onClick={() => handleDeleteProfile(p.id)}
                              title="Delete profile"
                              className="p-1 text-[#C6534B] hover:text-rose-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: WEBSITE TESTING (MULTI-DEVICE RUNNER) */}
          {/* ========================================================================= */}
          {activeTab === "web_test" && (
            <div className="space-y-6 animate-tab-enter">
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-[#252525] flex items-center gap-2">
                      <Globe className="w-5 h-5 text-[#D97745]" />
                      Website Performance Testing Engine
                    </h2>
                    <p className="text-xs text-[#6B6B65] mt-0.5">
                      Executes isolated Playwright browser sessions with real Chrome DevTools Protocol network & CPU throttling.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateToTab("device_builder")}
                    className="text-xs text-[#D97745] hover:text-[#B95E32] font-semibold flex items-center gap-1 group active:scale-95 transition-all"
                  >
                    <Sliders className="w-3.5 h-3.5" /> Open Device Builder
                  </button>
                </div>

                <form onSubmit={handleExecuteWebTest} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#252525] mb-1.5">Target Application URL</label>
                    <input
                      type="url"
                      value={testUrl}
                      onChange={e => setTestUrl(e.target.value)}
                      placeholder="https://your-target-domain.com"
                      required
                      className="w-full bg-white border border-[#D8D4C9] rounded-lg px-4 py-2.5 text-xs text-[#252525] shadow-sm focus:outline-none focus:border-[#D97745] font-mono"
                    />
                    <span className="text-[10px] text-[#6B6B65] mt-1 block">
                      SSRF Safety: Private IP subnets (10.0.0.0/8, 192.168.0.0/16), localhost, and metadata endpoints are strictly blocked.
                    </span>
                  </div>

                  {/* Mode Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-[#252525]">Device Configuration Selection Mode</label>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setTestSelectionMode("preset")}
                          className={`px-2.5 py-1 rounded text-xs transition border ${
                            testSelectionMode === "preset"
                              ? "bg-[#D97745] text-white border-[#D97745] font-semibold"
                              : "bg-[#FAF9F6] text-[#6B6B65] border-[#E6E2D9] hover:text-[#252525]"
                          }`}
                        >
                          Legacy Presets
                        </button>
                        <button
                          type="button"
                          onClick={() => setTestSelectionMode("multi_select")}
                          className={`px-2.5 py-1 rounded text-xs transition border ${
                            testSelectionMode === "multi_select"
                              ? "bg-[#D97745] text-white border-[#D97745] font-semibold"
                              : "bg-[#FAF9F6] text-[#6B6B65] border-[#E6E2D9] hover:text-[#252525]"
                          }`}
                        >
                          Multi-Device Suite ({selectedProfileIds.length} Selected)
                        </button>
                      </div>
                    </div>

                    {testSelectionMode === "preset" ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <div
                            onClick={() => setSelectedTier("BOTH")}
                            className={`p-3.5 rounded-xl border cursor-pointer transition shadow-sm ${
                              selectedTier === "BOTH"
                                ? "bg-[#F8E9DF] border-[#D97745] text-blue-900 ring-2 ring-[#D97745]/20 font-semibold"
                                : "bg-white border-[#E6E2D9] text-[#252525] hover:border-[#D8D4C9] hover:bg-[#FAF9F6]"
                            }`}
                          >
                            <div className="text-xs font-bold text-[#252525]">Dual Comparison (Both)</div>
                            <div className="text-[10px] text-[#6B6B65] mt-1">Good Budget (4x CPU) vs Entry-Level (8x CPU)</div>
                          </div>
                          <div
                            onClick={() => setSelectedTier("GOOD_BUDGET")}
                            className={`p-3.5 rounded-xl border cursor-pointer transition shadow-sm ${
                              selectedTier === "GOOD_BUDGET"
                                ? "bg-[#F8E9DF] border-[#D97745] text-blue-900 ring-2 ring-[#D97745]/20 font-semibold"
                                : "bg-white border-[#E6E2D9] text-[#252525] hover:border-[#D8D4C9] hover:bg-[#FAF9F6]"
                            }`}
                          >
                            <div className="text-xs font-bold text-[#252525]">Good Budget Only</div>
                            <div className="text-[10px] text-[#6B6B65] mt-1">4x CPU Throttling, Fast 3G network</div>
                          </div>
                          <div
                            onClick={() => setSelectedTier("ENTRY_LEVEL")}
                            className={`p-3.5 rounded-xl border cursor-pointer transition shadow-sm ${
                              selectedTier === "ENTRY_LEVEL"
                                ? "bg-[#F8E9DF] border-[#D97745] text-blue-900 ring-2 ring-[#D97745]/20 font-semibold"
                                : "bg-white border-[#E6E2D9] text-[#252525] hover:border-[#D8D4C9] hover:bg-[#FAF9F6]"
                            }`}
                          >
                            <div className="text-xs font-bold text-[#252525]">Entry-Level Only</div>
                            <div className="text-[10px] text-[#6B6B65] mt-1">8x CPU Throttling, Slow 3G network</div>
                          </div>
                          <div
                            onClick={() => setSelectedTier("CUSTOM")}
                            className={`p-3.5 rounded-xl border cursor-pointer transition shadow-sm ${
                              selectedTier === "CUSTOM"
                                ? "bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-500/20 font-semibold"
                                : "bg-white border-[#E6E2D9] text-[#252525] hover:border-indigo-300 hover:bg-indigo-50/30"
                            }`}
                          >
                            <div className="text-xs font-bold text-[#252525] flex items-center gap-1.5">
                              <Sliders className="w-3.5 h-3.5 text-[#D97745]" />
                              Custom Parameters
                            </div>
                            <div className="text-[10px] text-[#6B6B65] mt-1">Manual RAM, CPU Throttling, Network & Screen</div>
                          </div>
                        </div>

                        {/* Interactive Custom Device Live Tuning Panel */}
                        {selectedTier === "CUSTOM" && (
                          <div className="p-5 rounded-xl bg-white border border-indigo-200 shadow-sm space-y-4 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between border-b border-[#E6E2D9] pb-3">
                              <div className="flex items-center gap-2">
                                <Sliders className="w-4 h-4 text-[#D97745]" />
                                <h4 className="text-xs font-bold text-[#252525]">Manual Device Hardware & Network Configuration</h4>
                              </div>
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full font-mono font-semibold">
                                Live CDP Emulation Active
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Device Name */}
                              <div>
                                <label className="block text-[11px] font-semibold text-[#252525] mb-1">Configuration Name / Benchmark Label</label>
                                <input
                                  type="text"
                                  value={customDeviceName}
                                  onChange={e => setCustomDeviceName(e.target.value)}
                                  placeholder="e.g. Budget Phone (2GB RAM, 6x CPU)"
                                  className="w-full bg-white border border-[#D8D4C9] rounded-lg px-3 py-2 text-xs text-[#252525] shadow-sm focus:outline-none focus:border-indigo-500"
                                />
                              </div>

                              {/* Screen / Viewport */}
                              <div>
                                <label className="block text-[11px] font-semibold text-[#252525] mb-1">Screen Size & Viewport Emulation</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {[
                                    { id: "mobile_budget", label: "Budget (360x800)" },
                                    { id: "mobile_standard", label: "Standard (390x844)" },
                                    { id: "desktop", label: "Desktop (1366x768)" },
                                  ].map(vp => (
                                    <button
                                      key={vp.id}
                                      type="button"
                                      onClick={() => setCustomViewport(vp.id)}
                                      className={`px-2.5 py-2 rounded-lg text-[11px] font-medium border text-center transition ${
                                        customViewport === vp.id
                                          ? "bg-[#D97745] text-white border-[#D97745] font-semibold shadow-sm"
                                          : "bg-[#FAF9F6] text-[#252525] border-[#E6E2D9] hover:bg-[#EEECE5]"
                                      }`}
                                    >
                                      {vp.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* RAM Selector */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-[11px] font-semibold text-[#252525]">RAM (Analytical Memory Spec)</label>
                                <span className="text-xs font-mono font-bold text-[#D97745]">
                                  {customRamMb >= 1024 ? `${customRamMb / 1024} GB` : `${customRamMb} MB`}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {[1024, 2048, 3072, 4096, 6144, 8192, 12288].map(ram => (
                                  <button
                                    key={ram}
                                    type="button"
                                    onClick={() => setCustomRamMb(ram)}
                                    className={`px-3 py-1.5 rounded-lg text-xs border font-medium transition ${
                                      customRamMb === ram
                                        ? "bg-[#D97745] text-white border-[#D97745] font-semibold shadow-sm"
                                        : "bg-[#FAF9F6] text-[#252525] border-[#E6E2D9] hover:bg-[#EEECE5]"
                                    }`}
                                  >
                                    {ram >= 1024 ? `${ram / 1024} GB` : `${ram} MB`}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* CPU Throttling Rate */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-[11px] font-semibold text-[#252525]">CPU Throttling Rate (Real CDP Core Slowdown)</label>
                                <span className="text-xs font-mono font-bold text-[#D97745]">
                                  {customCpuThrottle}x Slowdown ({customCpuCores} Cores)
                                </span>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                {[
                                  { throttle: 1.0, cores: 8, label: "1x Unthrottled", desc: "Flagship / Fast PC" },
                                  { throttle: 2.0, cores: 6, label: "2x Mid-Range", desc: "Mid-tier Phone" },
                                  { throttle: 4.0, cores: 4, label: "4x Budget", desc: "$150 Budget Phone" },
                                  { throttle: 6.0, cores: 4, label: "6x Low-End", desc: "Older / Constrained" },
                                  { throttle: 8.0, cores: 2, label: "8x Entry-Level", desc: "Severe Throttle (<$80)" },
                                ].map(cpu => (
                                  <button
                                    key={cpu.throttle}
                                    type="button"
                                    onClick={() => {
                                      setCustomCpuThrottle(cpu.throttle);
                                      setCustomCpuCores(cpu.cores);
                                    }}
                                    className={`p-2.5 rounded-lg text-left border transition ${
                                      customCpuThrottle === cpu.throttle
                                        ? "bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-500/20 font-semibold shadow-sm"
                                        : "bg-[#FAF9F6] border-[#E6E2D9] text-[#252525] hover:bg-[#EEECE5]"
                                    }`}
                                  >
                                    <div className="text-xs font-bold">{cpu.label}</div>
                                    <div className="text-[10px] text-[#6B6B65] mt-0.5">{cpu.desc}</div>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Network Profile */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-[11px] font-semibold text-[#252525]">Network Condition (CDP Real Traffic Throttling)</label>
                                <span className="text-xs font-mono font-bold text-[#36865A]">
                                  {customNetworkPreset}: {customNetworkLatency}ms ping, {customNetworkDownKbps >= 1000 ? `${customNetworkDownKbps/1000} Mbps` : `${customNetworkDownKbps} kbps`} down
                                </span>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {[
                                  { name: "Slow 3G", down: 500, up: 250, lat: 200, desc: "200ms latency, 500 kbps" },
                                  { name: "Fast 3G", down: 1600, up: 750, lat: 40, desc: "40ms latency, 1.6 Mbps" },
                                  { name: "4G LTE", down: 9000, up: 3000, lat: 20, desc: "20ms latency, 9.0 Mbps" },
                                  { name: "Wi-Fi", down: 30000, up: 12000, lat: 10, desc: "10ms latency, 30.0 Mbps" },
                                ].map(net => (
                                  <button
                                    key={net.name}
                                    type="button"
                                    onClick={() => {
                                      setCustomNetworkPreset(net.name);
                                      setCustomNetworkDownKbps(net.down);
                                      setCustomNetworkUpKbps(net.up);
                                      setCustomNetworkLatency(net.lat);
                                    }}
                                    className={`p-2.5 rounded-lg text-left border transition ${
                                      customNetworkPreset === net.name
                                        ? "bg-emerald-50 border-[#36865A] text-emerald-900 ring-2 ring-emerald-500/20 font-semibold shadow-sm"
                                        : "bg-[#FAF9F6] border-[#E6E2D9] text-[#252525] hover:bg-[#EEECE5]"
                                    }`}
                                  >
                                    <div className="text-xs font-bold">{net.name}</div>
                                    <div className="text-[10px] text-[#6B6B65] mt-0.5">{net.desc}</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#252525] font-semibold">Select 2 or more devices for multi-configuration comparison:</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedProfileIds(savedProfiles.map(p => p.id))}
                              className="text-[10px] text-[#D97745] hover:underline"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedProfileIds([])}
                              className="text-[10px] text-[#6B6B65] hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                          {savedProfiles.map(p => {
                            const isChecked = selectedProfileIds.includes(p.id);
                            return (
                              <div
                                key={p.id}
                                onClick={() => toggleSelectProfileForTest(p.id)}
                                className={`p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                                  isChecked
                                    ? "bg-blue-600/20 border-[#D97745] text-white"
                                    : "bg-[#FAF9F6] border-[#E6E2D9] text-[#6B6B65] hover:border-slate-600"
                                }`}
                              >
                                <div className="truncate pr-2">
                                  <div className="text-xs font-semibold text-[#252525] truncate">{p.name}</div>
                                  <div className="text-[10px] text-[#6B6B65] font-mono truncate">
                                    {p.cpu_throttle_rate}x CPU • {p.network_profile}
                                  </div>
                                </div>
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-[#D97745] shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-[#6B6B65] shrink-0" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isRunningTest}
                    className="px-6 py-2.5 bg-[#D97745] hover:bg-[#B95E32] disabled:opacity-50 text-white font-medium text-xs rounded-lg transition-warm active:scale-[0.98] flex items-center gap-2 shadow-warm shadow-md"
                  >
                    {isRunningTest ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    {isRunningTest ? "Executing Background Suite..." : "Execute Performance Test"}
                  </button>
                </form>

                {/* Real-time Background Job Progress */}
                {activeJob && (
                  <div className="mt-6 p-4 rounded-xl bg-[#FAF9F6] border border-[#D97745]/40">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F8E9DF]0 animate-ping" />
                        <span className="text-xs font-bold text-[#252525] font-mono">Job ID: {activeJob.job_id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase ${
                          activeJob.status === "COMPLETED" ? "bg-emerald-500/20 text-emerald-300 border border-[#36865A]/40" :
                          activeJob.status === "COMPLETED_WITH_WARNINGS" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" :
                          activeJob.status === "FAILED" ? "bg-rose-500/20 text-rose-300 border border-rose-500/40" :
                          "bg-[#F8E9DF]0/20 text-blue-300 border border-[#D97745]/40"
                        }`}>
                          {activeJob.status.replace(/_/g, " ")}
                        </span>
                        <button
                          onClick={handleCancelJob}
                          disabled={isCancelling}
                          className="text-[10px] text-[#C6534B] hover:text-rose-300 underline font-semibold ml-2"
                        >
                          {isCancelling ? "Cancelling..." : "Cancel"}
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-[#252525] space-y-1">
                      <div><span className="text-[#6B6B65] font-semibold">Stage:</span> {activeJob.stage}</div>
                      <div><span className="text-[#6B6B65] font-semibold">Progress:</span> {activeJob.progress_message}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* ========================================================================= */}
              {/* RESULTS DASHBOARD */}
              {/* ========================================================================= */}
              {(comparisonData || testResult?.single_run_data) && (
                <div className="space-y-6">
                  {/* Results Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] text-[#252525] shadow-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase ${
                          testResult?.status === "COMPLETED" || comparisonData ? "bg-emerald-500/20 text-emerald-800 border border-[#36865A]/40" : "bg-amber-500/20 text-amber-800 border border-amber-500/40"
                        }`}>
                          {testResult?.status?.replace(/_/g, " ") || "COMPLETED"}
                        </span>
                        <span className="text-xs text-[#6B6B65] font-mono">
                          Mode: {testResult?.mode || (comparisonData ? "MULTI_COMPARISON" : "SINGLE_RUN")}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#252525] mt-1">
                        Results for Target: <span className="text-[#D97745] font-mono">{testResult?.target_url || testUrl}</span>
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenAuditReport(comparisonData || testResult?.single_run_data || testResult)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#D97745] hover:bg-[#B95E32] text-white text-xs font-semibold rounded-lg transition-warm active:scale-95 shadow-xs"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Interactive Audit Report</span>
                      </button>
                      <button
                        onClick={() => {
                          if (activeJob?.job_id) setLiveArenaJobId(activeJob.job_id);
                          navigateToTab("live_arena");
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#FAF9F5] hover:bg-[#EEECE5] border border-[#E6E2D9] text-[#252525] text-xs font-semibold rounded-lg transition-warm active:scale-95"
                      >
                        <Terminal className="w-3.5 h-3.5 text-[#D97745]" />
                        <span>Live Arena</span>
                      </button>
                    </div>
                  </div>

                  {/* Website Health Score Card Component */}
                  <HealthScoreCard
                    metrics={
                      comparisonData?.good_budget_run?.metrics ||
                      comparisonData?.runs?.[0]?.metrics ||
                      testResult?.single_run_data?.metrics ||
                      []
                    }
                    failures={
                      comparisonData?.entry_level_run?.failures ||
                      comparisonData?.runs?.[0]?.failures ||
                      testResult?.single_run_data?.failures ||
                      []
                    }
                    deviceName={
                      comparisonData?.good_budget_run?.device_profile?.name ||
                      testResult?.single_run_data?.device_profile?.name
                    }
                    targetUrl={testResult?.target_url || testUrl}
                  />

                    {/* The ₹8,000 Cheap Phone Test Verdict (T1.2) */}
                    {comparisonData?.cheap_phone_verdict && (
                      <div className={`p-4 rounded-xl border col-span-full shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        comparisonData.cheap_phone_verdict.status === "PASSED"
                          ? "bg-[#EBF5F0] border border-[#CDE5D8] text-[#252525]"
                          : "bg-[#FBEBEA] border border-[#F5C6C3] text-[#252525]"
                      }`}>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              comparisonData.cheap_phone_verdict.status === "PASSED"
                                ? "bg-[#36865A] text-white"
                                : "bg-[#C6534B] text-white"
                            }`}>
                              CHEAP PHONE TEST: {comparisonData.cheap_phone_verdict.status}
                            </span>
                            <span className="text-xs font-bold text-[#252525]">{comparisonData.cheap_phone_verdict.headline}</span>
                          </div>
                          {comparisonData.cheap_phone_verdict.status === "FAILED" && (
                            <span className="text-[11px] font-mono font-bold text-[#C6534B] bg-red-100 border border-red-300 px-2 py-0.5 rounded animate-pulse ring-1 ring-red-400/50 shadow-sm">
                              🚨 ~{comparisonData.cheap_phone_verdict.total_indian_users_at_risk_millions}M Users At Risk ({comparisonData.cheap_phone_verdict.market_share_at_risk_pct}% of India)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#252525] mt-1 font-mono">
                          <strong>Bottleneck: </strong>{comparisonData.cheap_phone_verdict.bottleneck}
                        </p>
                      </div>
                    )}

                    {comparisonData?.best_configuration && comparisonData?.worst_configuration && (
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <div className="p-2 rounded bg-emerald-500/10 border border-[#36865A]/30">
                          <span className="text-[10px] text-[#36865A] block font-semibold">BEST PERFORMER</span>
                          <span className="font-bold text-[#252525]">{comparisonData.best_configuration.name}</span>
                        </div>
                        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30">
                          <span className="text-[10px] text-[#C6534B] block font-semibold">HIGHEST DEGRADATION</span>
                          <span className="font-bold text-[#252525]">{comparisonData.worst_configuration.name}</span>
                        </div>
                      </div>
                    )}

                  {/* Multi-Device Comparison Visualizer */}
                  {comparisonChartData.length > 0 && (
                    <div className="p-6 bg-[#FFFFFF] border border-[#E6E2D9] rounded-xl shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-[#252525] flex items-center gap-2">
                            <GitCompare className="w-4 h-4 text-[#D97745]" />
                            Multi-Device Performance Degradation Differential (Core Web Vitals)
                          </h4>
                          <p className="text-[11px] text-[#6B6B65] mt-0.5">
                            Real measured browser execution across configured device profiles.
                          </p>
                        </div>
                      </div>

                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E6E2D9" />
                            <XAxis dataKey="name" stroke="#6B6B65" fontSize={11} />
                            <YAxis stroke="#6B6B65" fontSize={11} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#E6E2D9", color: "#252525", fontSize: "11px", borderRadius: "8px" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            {profileKeysInChart.map((pName, idx) => (
                              <Bar
                                key={pName}
                                dataKey={pName}
                                fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                                radius={[4, 4, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Multi-Device Metrics Table */}
                  {effectiveMetricsDiff && Object.keys(effectiveMetricsDiff).length > 0 && (
                    <div className="p-6 bg-[#FFFFFF] border border-[#E6E2D9] rounded-xl shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-[#252525] flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-[#D97745]" /> Metric Breakdown & Degradation Percentages
                        </h4>
                        <span className="text-[11px] font-mono text-[#6B6B65] bg-[#EEECE5] px-2.5 py-0.5 rounded border border-[#E6E2D9]">
                          {Object.keys(effectiveMetricsDiff).length} Metrics Measured Across Devices
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-[#E6E2D9] text-[#252525] font-bold bg-[#EEECE5]">
                              <th className="py-2.5 px-3">Metric</th>
                              <th className="py-2.5 px-3">Unit</th>
                              {profileKeysInChart.map(pName => (
                                <th key={pName} className="py-2.5 px-3 text-[#252525] font-bold">{pName}</th>
                              ))}
                              <th className="py-2.5 px-3 text-[#C58A35] font-bold">Degradation vs Baseline</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 font-mono">
                            {Object.entries(effectiveMetricsDiff).map(([mName, mData]: [string, any]) => {
                              return (
                                <tr key={mName} className="hover:bg-[#FAF9F6]/80 transition">
                                  <td className="py-3 px-3 font-bold text-[#252525]">{mName}</td>
                                  <td className="py-3 px-3 text-[#6B6B65]">{mData.unit}</td>
                                  {profileKeysInChart.map(pName => (
                                    <td key={pName} className="py-3 px-3 text-[#252525] font-bold">
                                      {mData.values?.[pName] !== undefined && mData.values?.[pName] !== null
                                        ? mData.values[pName]
                                        : "N/A"}
                                    </td>
                                  ))}
                                  <td className="py-3 px-3">
                                    {mData.degradations_pct && Object.keys(mData.degradations_pct).length > 0 ? (
                                      <div className="space-y-0.5 text-[10px]">
                                        {Object.entries(mData.degradations_pct).map(([pName, pct]: [string, any]) => (
                                          pct > 0 ? (
                                            <span key={pName} className="inline-block mr-2 px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                                              {pName}: +{pct}% Slowdown
                                            </span>
                                          ) : null
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-[#36865A] font-bold text-[10px]">Baseline Fast</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ACTUAL TEST EXECUTION LOGS, WARNINGS & CRASH REASONS */}
                  {comparisonData?.runs && comparisonData.runs.length > 0 && (
                    <div className="p-6 bg-[#FFFFFF] border border-[#E6E2D9] rounded-xl shadow-sm space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-[#252525] flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-indigo-500" />
                          Actual Target Website Execution Logs & Failure Diagnosis
                        </h4>
                        <p className="text-[11px] text-[#6B6B65] mt-0.5">
                          Real CDP network trace errors, console warnings, and device crash reasons recorded during live browser testing.
                        </p>
                      </div>

                      <div className="space-y-3">
                        {comparisonData.runs.map((r: any, rIdx: number) => {
                          const profName = r.device_profile?.name || (r.tier === "GOOD_BUDGET" ? "Good Budget Tier (Galaxy A14 / Moto G)" : "Entry-Level Tier (Redmi 9A / Nokia C)");
                          const isFailed = r.status === "FAILED";
                          const hasWarnings = r.status === "COMPLETED_WITH_WARNINGS" || (r.failures && r.failures.length > 0);
                          const durationSec = ((r.duration_ms || 0) / 1000).toFixed(1);

                          return (
                            <div key={r.id || rIdx} className={`p-4 rounded-xl border ${
                              isFailed
                                ? "bg-rose-50/70 border-rose-300"
                                : hasWarnings
                                  ? "bg-amber-50/60 border-amber-300"
                                  : "bg-[#FAF9F6] border-[#E6E2D9]"
                            }`}>
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#E6E2D9]">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-[#252525]">{profName}</span>
                                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                                    isFailed
                                      ? "bg-rose-100 text-rose-800 border-rose-300"
                                      : hasWarnings
                                        ? "bg-amber-100 text-[#C58A35] border-amber-300"
                                        : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  }`}>
                                    {isFailed ? "🚨 CRASHED / FAILED" : hasWarnings ? "⚠️ NON-FATAL WARNINGS" : "✅ CLEAN EXECUTION"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#6B6B65] font-mono">
                                  Execution Duration: <span className="font-bold text-[#252525]">{durationSec}s ({r.duration_ms}ms)</span>
                                </div>
                              </div>

                              {/* Crash / Failure Diagnosis if Failed */}
                              {isFailed && (
                                <div className="mt-3 p-3 rounded-lg bg-rose-100/90 border border-rose-300 text-xs text-rose-900 space-y-1">
                                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                                    <AlertOctagon className="w-4 h-4 text-[#C6534B]" />
                                    Website Crashed or Froze under {profName} constraints!
                                  </div>
                                  <p className="text-[11px] text-rose-800 font-mono">{r.failure_summary || "Browser navigation or main thread blocked beyond timeout limits."}</p>
                                  <p className="text-[11px] text-rose-700">
                                    Reason: Constrained entry-level hardware (low RAM, aggressive 8x CPU throttling, and slow network) exhausted device resources causing the target site to freeze or crash.
                                  </p>
                                </div>
                              )}

                              {/* Detailed Failure & Warning Logs */}
                              {r.failures && r.failures.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  <div className="text-[11px] font-bold text-[#252525] uppercase tracking-wider">
                                    Captured Network & Console Logs ({r.failures.length}):
                                  </div>
                                  <div className="space-y-1.5 font-mono text-[11px]">
                                    {r.failures.map((f: any, fIdx: number) => (
                                      <div key={f.id || fIdx} className="p-3 rounded-lg bg-[#FFFFFF] border border-[#E6E2D9] space-y-1 shadow-sm text-[#252525]">
                                        <div className="flex items-center justify-between text-[10px]">
                                          <span className="font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                                            {f.failure_type || "WARNING"}
                                          </span>
                                          <span className="text-[#6B6B65] font-mono">{f.error_signature || "Runtime Issue"}</span>
                                        </div>
                                        <div className="font-semibold text-[#252525] text-xs">{f.title}</div>
                                        {f.message && (
                                          <div className="text-[11px] text-[#252525] bg-[#FAF9F6] p-2 rounded border border-[#E6E2D9]/80 overflow-x-auto whitespace-pre-wrap">
                                            {f.message}
                                          </div>
                                        )}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-[#E6E2D9]/40 mt-1">
                                          {f.url_or_file ? (
                                            <div className="text-[10px] text-[#6B6B65] truncate flex-1">
                                              Endpoint: <span className="text-[#D97745] underline">{f.url_or_file}</span>
                                            </div>
                                          ) : <div />}
                                          <button
                                            onClick={() => handleOpenVisualEvidence([f], f.screenshot_url || r.screenshot_url, profName)}
                                            className="text-[11px] font-semibold text-[#D97745] hover:text-[#B95E32] flex items-center gap-1 transition-colors self-end sm:self-auto shrink-0"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                            <span>View Evidence</span>
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                !isFailed && (
                                  <div className="mt-2.5 text-[11px] text-emerald-800 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#36865A]" />
                                    All page assets, JavaScript bundles, stylesheets, and APIs loaded cleanly without errors.
                                  </div>
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Device Configuration Summary Cards */}
                  {comparisonData?.configurations && (
                    <div className="p-6 bg-[#FFFFFF] border border-[#E6E2D9] rounded-xl shadow-sm">
                      <h4 className="text-sm font-bold text-[#252525] mb-3 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-[#D97745]" /> Tested Device Specifications & Emulation Profile
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {comparisonData.configurations.map((cfg: any, idx: number) => (
                          <div key={idx} className="p-3.5 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] space-y-1.5 font-mono text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#252525]">{cfg.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#F8E9DF] text-[#D97745] border border-[#F1D5C4]">
                                {cfg.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#6B6B65] space-y-0.5 pt-1">
                              <div>CPU: {cfg.cpu_cores} Cores • {cfg.cpu_throttle_rate}x CDP Slowdown</div>
                              <div>RAM: {Math.round(cfg.ram_mb / 1024)} GB • Storage: {cfg.storage_profile}</div>
                              <div>Network: {cfg.network_profile}</div>
                              <div>Execution Duration: {cfg.duration_ms}ms</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Limitation Notice Card */}
                  <div className="p-4 rounded-xl bg-slate-900 border border-[#E6E2D9] text-xs text-[#6B6B65] space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-[#252525]">
                      <Info className="w-4 h-4 text-[#D97745] shrink-0" />
                      <span>Technical Emulation Disclosure:</span>
                    </div>
                    <p className="text-[11px] text-[#6B6B65]">
                      CPU throttling factor and Network conditions are enforced in real-time via Chrome DevTools Protocol.
                      RAM capacity and Storage performance parameters are maintained as target hardware specifications for correlation.
                      Browser tests execute within isolated headless Chromium contexts without physical hardware virtualization.
                    </p>
                  </div>

                  {/* Root Cause Analysis & Recommendations */}
                  {recommendations.length > 0 && (
                    <div className="p-6 bg-[#FFFFFF] border border-[#E6E2D9] rounded-xl shadow-sm space-y-4">
                      <h4 className="text-sm font-bold text-[#252525] flex items-center gap-2">
                        <Brain className="w-4 h-4 text-pink-400" />
                        Evidence-Grounded Root Cause Findings ({recommendations.length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {recommendations.map((rec, i) => (
                          <div key={i} className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-bold text-xs text-[#252525]">{rec.title}</div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${
                                rec.impact === "HIGH" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              }`}>
                                {rec.impact} IMPACT
                              </span>
                            </div>

                            {rec.affected_device_configuration && (
                              <div className="text-[11px] text-indigo-300 font-mono">
                                Affected Device: {rec.affected_device_configuration}
                              </div>
                            )}

                            {rec.confidence_level && (
                              <div className="text-[10px] text-[#6B6B65] font-mono">
                                Confidence Level: <span className="text-[#36865A]">{rec.confidence_level}</span>
                              </div>
                            )}

                            <p className="text-xs text-[#252525]">{rec.probable_cause}</p>

                            <div className="pt-2 border-t border-[#E6E2D9] text-[11px] text-[#6B6B65]">
                              <span className="font-semibold text-[#252525] block mb-0.5">Recommended Remediation:</span>
                              <pre className="whitespace-pre-wrap font-sans text-[#252525]">{rec.remediation || rec.recommended_fix}</pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DEVICE COMPARISON (STANDALONE EXPLORER) */}
          {/* ========================================================================= */}
          {activeTab === "compare" && (
            <div className="space-y-6 animate-tab-enter">
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-[#252525] flex items-center gap-2">
                      <GitCompare className="w-5 h-5 text-[#D97745]" />
                      Side-by-Side Device Comparison Dashboard
                    </h2>
                    <p className="text-xs text-[#6B6B65] mt-0.5">
                      Differential performance analysis across hardware configurations.
                    </p>
                  </div>
                  {comparisonData?.comparison_group_id && (
                    <span className="text-[10px] font-mono text-[#6B6B65] bg-[#EEECE5] px-2.5 py-1 rounded border border-[#E6E2D9]">
                      Group ID: {comparisonData.comparison_group_id.slice(0, 12)}
                    </span>
                  )}
                </div>

                {!comparisonData ? (
                  <div className="p-12 text-center text-[#6B6B65] text-xs space-y-3">
                    <p>No comparison execution loaded yet.</p>
                    <button
                      onClick={() => navigateToTab("web_test")}
                      className="px-4 py-2 bg-[#D97745] hover:bg-[#B95E32] text-white shadow-warm rounded text-xs font-semibold transition-warm active:scale-95 shadow-md"
                    >
                      Go to Website Testing & Run Test
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Comparative Bar Chart */}
                    <div className="p-5 bg-[#FAF9F6] border border-[#E6E2D9] rounded-xl space-y-3">
                      <h4 className="text-xs font-bold text-[#252525]">Comparative Core Web Vitals Differential</h4>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={comparisonChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E6E2D9" />
                            <XAxis dataKey="name" stroke="#6B6B65" fontSize={11} />
                            <YAxis stroke="#6B6B65" fontSize={11} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#E6E2D9", color: "#252525", fontSize: "11px", borderRadius: "8px" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            {profileKeysInChart.map((pName, idx) => (
                              <Bar
                                key={pName}
                                dataKey={pName}
                                fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                                radius={[4, 4, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Metric Differences Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead>
                          <tr className="border-b border-[#E6E2D9] text-[#6B6B65] font-semibold bg-[#FAF9F6]">
                            <th className="py-2.5 px-3">Metric</th>
                            <th className="py-2.5 px-3">Unit</th>
                            {profileKeysInChart.map(pName => (
                              <th key={pName} className="py-2.5 px-3 text-[#252525]">{pName}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {comparisonChartData.map((row: any) => (
                            <tr key={row.name} className="hover:bg-[#EEECE5]/30">
                              <td className="py-3 px-3 font-bold text-[#252525]">{row.name}</td>
                              <td className="py-3 px-3 text-[#6B6B65]">{row.unit}</td>
                              {profileKeysInChart.map(pName => (
                                <td key={pName} className="py-3 px-3 text-[#252525]">
                                  {row[pName] !== undefined && row[pName] !== null ? row[pName] : "N/A"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: FAILURE EXPLORER */}
          {/* ========================================================================= */}
          {activeTab === "failures" && (
            <div className="space-y-6 animate-tab-enter">
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-[#252525] flex items-center gap-2">
                      <AlertOctagon className="w-5 h-5 text-[#C6534B]" />
                      Failure Explorer & Population Impact Ranking
                    </h2>
                    <p className="text-xs text-[#6B6B65] mt-0.5">
                      Failures and runtime exceptions ranked by how many Indian users they impact (T1.2).
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-[#FBF4E8] text-[#C58A35] border border-[#F5DFBF] px-2.5 py-1 rounded">
                    Ranked by User Blast Radius
                  </span>
                </div>

                {/* Active Tested Website Banner */}
                {(comparisonData?.target_url || comparisonData?.entry_level_run?.target_url || comparisonData?.runs?.[0]?.target_url) && (
                  <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg text-xs font-mono">
                    <span className="text-[#6B6B65]">Active Target:</span>
                    <span className="text-[#D97745] font-bold">{comparisonData?.target_url || comparisonData?.entry_level_run?.target_url || comparisonData?.runs?.[0]?.target_url}</span>
                  </div>
                )}

                {/* Cheap Phone Test Verdict Card */}
                {comparisonData?.cheap_phone_verdict && (
                  <div className={`p-4 rounded-xl border mb-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    comparisonData.cheap_phone_verdict.status === "PASSED"
                      ? "bg-[#EBF5F0] border border-[#CDE5D8] text-[#252525]"
                      : "bg-[#FBEBEA] border border-[#F5C6C3] text-[#252525]"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          comparisonData.cheap_phone_verdict.status === "PASSED"
                            ? "bg-[#36865A] text-white"
                            : "bg-[#C6534B] text-white"
                        }`}>
                          CHEAP PHONE TEST: {comparisonData.cheap_phone_verdict.status}
                        </span>
                        <span className="text-xs font-bold">{comparisonData.cheap_phone_verdict.headline}</span>
                      </div>
                      {comparisonData.cheap_phone_verdict.status === "FAILED" && (
                        <span className="text-[11px] font-mono font-bold text-[#C6534B] bg-red-100 border border-red-300 px-2 py-0.5 rounded animate-pulse ring-1 ring-red-400/50 shadow-sm">
                          ~{comparisonData.cheap_phone_verdict.total_indian_users_at_risk_millions}M Users At Risk ({comparisonData.cheap_phone_verdict.market_share_at_risk_pct}% of India)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#252525] mt-1 font-mono">
                      <strong>Bottleneck: </strong>{comparisonData.cheap_phone_verdict.bottleneck}
                    </p>
                  </div>
                )}

                {(!(comparisonData?.ranked_failures?.length > 0) && (!comparisonData?.entry_level_run?.failures || comparisonData.entry_level_run.failures.length === 0) && (!comparisonData?.failures || comparisonData.failures.length === 0)) ? (
                  <div className="p-8 text-center text-[#96948D] text-xs bg-[#FAF9F6] rounded-xl border border-[#E6E2D9]">
                    Zero fatal exceptions detected in active run session.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {((comparisonData?.ranked_failures?.length > 0 ? comparisonData.ranked_failures : (comparisonData?.entry_level_run?.failures || comparisonData?.failures || [])) as any[]).map((fail: any, fIdx: number) => {
                      const getCategoryBadge = (type: string) => {
                        switch (type) {
                          case "TARGET_APPLICATION_ERROR":
                          case "JS_ERROR":
                            return "bg-purple-100 text-purple-700 border-purple-200";
                          case "NETWORK_ERROR":
                            return "bg-rose-100 text-rose-700 border-rose-200";
                          case "HTTP_ERROR":
                          case "HTTP_FAILURE":
                            return "bg-blue-100 text-blue-700 border-[#F1D5C4]";
                          case "BROWSER_INFRASTRUCTURE_ERROR":
                            return "bg-slate-200 text-[#252525] border-[#D8D4C9]";
                          case "ACCESS_RESTRICTION":
                            return "bg-orange-100 text-orange-800 border-orange-200";
                          case "NAVIGATION_TIMEOUT":
                          case "PERFORMANCE_REGRESSION":
                            return "bg-amber-100 text-[#C58A35] border-amber-200";
                          case "SSL_ERROR":
                            return "bg-yellow-100 text-yellow-800 border-yellow-200";
                          default:
                            return "bg-red-100 text-[#C6534B] border-red-200";
                        }
                      };

                      return (
                        <div key={fail.id || fIdx} className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] font-mono text-xs">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#C6534B] text-white font-black px-2 py-0.5 rounded text-[10px]">
                                RANK #{fail.rank || (fIdx + 1)}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${getCategoryBadge(fail.failure_type)}`}>
                                {fail.failure_type}
                              </span>
                              {fail.users_hit_millions && (
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded text-[10px]">
                                  🚨 {fail.users_hit_millions}M Users Hit ({fail.population_pct}% of India)
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#6B6B65]">
                              Sig: {fail.error_signature}
                            </span>
                          </div>
                          {fail.cohort_name && (
                            <div className="text-[10px] text-[#6B6B65] mb-1">
                              Affected Cohort: <span className="font-semibold text-[#252525]">{fail.cohort_name}</span>
                            </div>
                          )}
                          <h4 className="font-bold text-[#252525] text-sm mb-1">{fail.title}</h4>
                          <p className="text-[#6B6B65] text-[11px] mb-2">{fail.message}</p>
                          {fail.url_or_file && (
                            <div className="text-[10px] text-blue-700 truncate">
                              Source: {fail.url_or_file}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: ROOT CAUSE ANALYSIS */}
          {/* ========================================================================= */}
          {activeTab === "rca" && (
            <div className="space-y-6 animate-tab-enter">
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <h2 className="text-base font-bold text-[#252525] flex items-center gap-2 mb-2">
                  <Brain className="w-5 h-5 text-pink-400" />
                  Deterministic & AI-Assisted Root Cause Intelligence
                </h2>
                <p className="text-xs text-[#6B6B65] mb-6">
                  Synthesizes real Web Vitals measurements, long tasks, and resource transfers into verified remediation steps.
                </p>

                {/* Active Tested Website Banner */}
                {(comparisonData?.target_url || comparisonData?.entry_level_run?.target_url || comparisonData?.runs?.[0]?.target_url) && (
                  <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-[#FAF9F5] border border-[#E6E2D9] rounded-lg text-xs font-mono">
                    <span className="text-[#6B6B65]">Active Target:</span>
                    <span className="text-[#D97745] font-bold">{comparisonData?.target_url || comparisonData?.entry_level_run?.target_url || comparisonData?.runs?.[0]?.target_url}</span>
                  </div>
                )}

                {recommendations.length === 0 ? (
                  <div className="p-12 text-center text-[#6B6B65] text-xs">
                    No active root cause recommendations. Execute a test run to generate findings.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recommendations.map((r: any, idx: number) => (
                      <div key={idx} className="p-5 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-pink-300">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-sm text-[#252525]">{r.title}</div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                            r.impact === "HIGH" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}>
                            {r.impact} IMPACT
                          </span>
                        </div>
                        <div className="text-xs text-[#252525]">{r.probable_cause}</div>
                        <div className="p-3 rounded bg-[#FAF9F6] border border-[#E6E2D9] text-xs text-[#252525]">
                          <span className="font-semibold text-[#6B6B65] block mb-1">Concrete Remediation:</span>
                          <pre className="whitespace-pre-wrap font-sans">{r.remediation || r.recommended_fix}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: NEO4J INTELLIGENCE EXPLORER */}
          {/* ========================================================================= */}
          {activeTab === "graph" && (
            <div className="animate-tab-enter">
              <IntelligenceExplorer />
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: ANDROID APK TESTING */}
          {/* ========================================================================= */}
          {activeTab === "android_test" && (
            <div className="space-y-6 animate-tab-enter">
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <h2 className="text-base font-bold text-[#252525] flex items-center gap-2 mb-2">
                  <Smartphone className="w-5 h-5 text-[#36865A]" />
                  Engine B: Android APK Device Testing
                </h2>
                <p className="text-xs text-[#6B6B65] mb-6">
                  Upload native Android APKs for inspection, activity resolution, and ADB hardware test execution.
                </p>

                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-3">
                  <div className="text-xs font-semibold text-[#252525]">Upload Native APK Package</div>
                  <input
                    type="file"
                    accept=".apk"
                    onChange={handleApkUpload}
                    className="text-xs text-[#6B6B65] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#D97745] file:text-white hover:file:bg-[#B95E32] file:transition-warm file:active:scale-95"
                  />
                  {isUploadingApk && <div className="text-xs text-[#D97745] animate-pulse">Analyzing APK manifest...</div>}

                  {apkManifest && (
                    <div className="mt-4 p-4 rounded-lg bg-[#FAF9F6] border border-[#E6E2D9] text-xs font-mono space-y-2 animate-tab-enter">
                      <div>Package: <span className="text-[#36865A] font-bold">{apkManifest.package_name}</span></div>
                      <div>App Name: <span className="text-white">{apkManifest.app_name}</span></div>
                      <div>Version: <span className="text-[#252525]">{apkManifest.version_name} (Code: {apkManifest.version_code})</span></div>
                      <div>Launch Activity: <span className="text-[#D97745]">{apkManifest.launchable_activity}</span></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DEVICE LAB */}
          {/* ========================================================================= */}
          {activeTab === "device_lab" && (
            <div className="space-y-6 animate-tab-enter">
              <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                <h2 className="text-base font-bold text-[#252525] flex items-center gap-2 mb-2">
                  <Radio className="w-5 h-5 text-purple-400" />
                  Connected Device Lab & Tier Diagnostics
                </h2>
                <p className="text-xs text-[#6B6B65] mb-6">
                  Real-time status of ADB daemon, connected physical phones, and Android emulators.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                    <span className="text-xs font-bold text-[#252525] block">ADB Host Daemon</span>
                    <div className="text-xs font-mono text-[#6B6B65]">
                      Status: <span className={deviceLabStatus?.adb_available ? "text-[#36865A] font-bold" : "text-[#C58A35]"}>
                        {deviceLabStatus?.adb_available ? "CONNECTED" : "SETUP_REQUIRED"}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6B6B65]">
                      If testing physical Android hardware, install Android SDK platform-tools and enable USB debugging.
                    </p>
                  </div>

                  {/* Good Budget */}
                  <div className="p-5 rounded-xl bg-[#FAF9F6] border border-[#F1D5C4] space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-blue-700">Good Budget Tier</span>
                      <span className="text-[10px] font-mono bg-blue-100 text-blue-800 border border-[#F1D5C4] px-2 py-0.5 rounded font-semibold">~₹15,000 Bracket (24.8% of India)</span>
                    </div>
                    <p className="text-xs text-[#6B6B65]">Representative of Samsung Galaxy A14 / Moto G series / Helio G85.</p>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between border-b border-[#E6E2D9] py-1.5">
                        <span className="text-[#6B6B65]">CPU Throttling:</span>
                        <span className="text-[#252525] font-semibold">4x Slowdown</span>
                      </div>
                      <div className="flex justify-between border-b border-[#E6E2D9] py-1.5">
                        <span className="text-[#6B6B65]">Network Simulation:</span>
                        <span className="text-[#252525] font-semibold">Fast 3G (1.6 Mbps / 100ms)</span>
                      </div>
                      <div className="flex justify-between border-b border-[#E6E2D9] py-1.5">
                        <span className="text-[#6B6B65]">Viewport:</span>
                        <span className="text-[#252525] font-semibold">390 x 844 (Scale 2.5)</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-[#6B6B65]">RAM:</span>
                        <span className="text-[#252525] font-semibold">4,096 MB</span>
                      </div>
                    </div>
                  </div>

                  {/* Entry-Level */}
                  <div className="p-5 rounded-xl bg-[#FAF9F6] border border-sky-200 space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-sky-300">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-sky-700">The ₹8,000 Cheap Phone Test Tier</span>
                      <span className="text-[10px] font-mono bg-sky-100 text-sky-800 border border-sky-200 px-2 py-0.5 rounded font-semibold animate-pulse ring-1 ring-sky-400/50 shadow-sm">~₹8,000 / $100 (38.5% of India)</span>
                    </div>
                    <p className="text-xs text-[#6B6B65]">Representative of Redmi 9A / Poco C51 / JioPhone Next / Unisoc SC9863A.</p>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between border-b border-[#E6E2D9] py-1.5">
                        <span className="text-[#6B6B65]">CPU Throttling:</span>
                        <span className="text-[#252525] font-semibold">8x Slowdown</span>
                      </div>
                      <div className="flex justify-between border-b border-[#E6E2D9] py-1.5">
                        <span className="text-[#6B6B65]">Network Simulation:</span>
                        <span className="text-[#252525] font-semibold">Slow 3G (500 kbps / 200ms)</span>
                      </div>
                      <div className="flex justify-between border-b border-[#E6E2D9] py-1.5">
                        <span className="text-[#6B6B65]">Viewport:</span>
                        <span className="text-[#252525] font-semibold">360 x 800 (Scale 2.0)</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-[#6B6B65]">RAM:</span>
                        <span className="text-[#252525] font-semibold">2,048 MB</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E6E2D9] space-y-2">
                    <span className="text-xs font-bold text-[#252525] block">Web Browser Engine</span>
                    <div className="text-xs font-mono text-[#36865A] font-bold">PLAYWRIGHT CHROMIUM READY</div>
                    <p className="text-[11px] text-[#6B6B65]">
                      Full CDP CPU & Network emulation operational.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: DOCUMENTATION & SETTINGS */}
          {/* ========================================================================= */}
          {activeTab === "docs" && (
            <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm text-xs text-[#252525] space-y-4 animate-tab-enter transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
              <h2 className="text-base font-bold text-[#252525]">TierLens Architecture & Testing Methodology</h2>
              <p>
                TierLens is an enterprise device intelligence platform enabling developers to test web applications
                under configurable hardware constraints (CPU throttling, network latency, bandwidth throttling).
              </p>
              <h3 className="font-bold text-[#252525] text-sm pt-2">CDP Emulation & Technical Accuracy</h3>
              <ul className="list-disc pl-5 space-y-1 text-[#6B6B65]">
                <li>CPU Throttling: Emulation.setCPUThrottlingRate reduces execution thread speed by integer/float multiples.</li>
                <li>Network Emulation: Network.emulateNetworkConditions introduces RTT latency, download caps, and upload limits.</li>
                <li>RAM & Storage: Analyzed as device specifications for correlation; host hardware memory is preserved safely.</li>
              </ul>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E6E2D9] shadow-warm text-xs text-[#252525] space-y-4 animate-tab-enter transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#D97745]/40">
              <h2 className="text-base font-bold text-[#252525]">Platform Settings</h2>
              <div className="space-y-2 font-mono">
                <div>PostgreSQL DB: <span className="text-[#36865A]">ep-mute-sun-bi9ugppk.aws.neon.tech</span></div>
                <div>Neo4j Bolt: <span className="text-[#6B6B65]">{systemHealth?.neo4j?.uri || "bolt://localhost:7687"}</span></div>
                <div>Browser Runner: <span className="text-[#D97745]">Playwright Chromium (Headless)</span></div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: LIVE TESTING ARENA */}
          {/* ========================================================================= */}
          {activeTab === "live_arena" && (
            <div className="animate-tab-enter">
              <LiveTestingArena
                initialJobId={liveArenaJobId || activeJob?.job_id}
                onOpenAuditReport={async (jId, runId, payload) => {
                  if (payload) {
                    handleOpenAuditReport(payload);
                    return;
                  }
                  if (jId) {
                    try {
                      const res = await ApiClient.getWebJobStatus(jId);
                      const data = res?.comparison_data || res?.single_run_data || res;
                      if (data) {
                        handleOpenAuditReport(data);
                        return;
                      }
                    } catch (e) {
                      console.error("Failed to load audit report for job:", e);
                    }
                  }
                  handleOpenAuditReport(comparisonData || testResult?.single_run_data || testResult);
                }}
                onOpenGraph={() => navigateToTab("graph")}
              />
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: AUDIT REPORTS */}
          {/* ========================================================================= */}
          {activeTab === "reports" && (
            <div className="animate-tab-enter">
              <AuditReportsView
                onSelectRunForReport={(r) => handleOpenAuditReport(r)}
              />
            </div>
          )}

        </div>
      </main>

      {/* Global Interactive Audit Report Modal */}
      {isAuditModalOpen && auditReportData && (
        <AuditReportModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          reportData={auditReportData}
        />
      )}

      {/* Global Visual Failure Evidence Lightbox */}
      {isEvidenceModalOpen && (
        <VisualEvidenceViewer
          isOpen={isEvidenceModalOpen}
          onClose={() => setIsEvidenceModalOpen(false)}
          failures={evidenceFailures}
          defaultScreenshotUrl={evidenceScreenshot}
          deviceName={evidenceDeviceName}
          targetUrl={testUrl}
        />
      )}
    </div>
  );
}
