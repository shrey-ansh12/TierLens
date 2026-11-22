function getApiBase(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    // If running in browser on local machine (localhost or 127.0.0.1)
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return (envUrl && envUrl.includes("localhost")) ? envUrl.replace(/\/+$/, "") : "http://localhost:8000";
    }
  }
  // For all other devices, other laptops, mobile browsers, and production cloud:
  // Directly connect to the live Render backend
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/+$/, "");
  }
  return "https://tierlens.onrender.com";
}

export class ApiClient {
  private static token: string | null = null;

  static setToken(tok: string) {
    this.token = tok;
    if (typeof window !== "undefined") {
      localStorage.setItem("tierlens_token", tok);
    }
  }

  static getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("tierlens_token");
    }
    return this.token;
  }

  static clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("tierlens_token");
    }
  }

  static getBaseUrl(): string {
    return getApiBase();
  }

  private static async request(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };

    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const base = getApiBase();
    let res: Response;
    try {
      res = await fetch(`${base}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (netErr: any) {
      // If primary endpoint (e.g. localhost) is offline or unreachable, fall back to live Render backend
      if (base !== "https://tierlens.onrender.com") {
        try {
          res = await fetch(`https://tierlens.onrender.com${endpoint}`, {
            ...options,
            headers,
          });
        } catch {
          console.error(`Both local (${base}) and live Render API failed for ${endpoint}:`, netErr);
          throw new Error("Unable to connect to TierLens API server. Please check backend connection.");
        }
      } else {
        console.error(`Network fetch failed for ${base}${endpoint}:`, netErr);
        throw new Error("Unable to connect to TierLens API server. Please check backend connection.");
      }
    }

    if (res.status === 401 && !endpoint.includes("/auth/")) {
      // Automatic token renewal on session expiry
      this.clearToken();
      try {
        const reauth = await this.login({ email: "demo@tierlens.com", password: "Password123!" });
        if (reauth && reauth.access_token) {
          this.setToken(reauth.access_token);
          headers["Authorization"] = `Bearer ${reauth.access_token}`;
          const retryRes = await fetch(`${base}${endpoint}`, {
            ...options,
            headers,
          });
          if (retryRes.ok) {
            return retryRes.json();
          }
        }
      } catch (authErr) {
        // Fall back to original error behavior
      }
    }

    if (!res.ok) {
      let errDetail = "Request failed";
      try {
        const errorData = await res.json();
        errDetail = errorData.detail || errorData.message || JSON.stringify(errorData);
      } catch (e) {
        errDetail = await res.text();
      }
      throw new Error(errDetail);
    }

    return res.json();
  }

  // Health
  static getHealth() {
    return this.request("/api/v1/system/health");
  }

  // Auth
  static register(data: { email: string; password: string; full_name?: string }) {
    return this.request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  static login(data: { email: string; password: string }) {
    return this.request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  static getMe() {
    return this.request("/api/v1/auth/me");
  }

  // Projects
  static listProjects() {
    return this.request("/api/v1/projects");
  }

  static createProject(data: { name: string; type: string; target_url?: string; package_name?: string; description?: string }) {
    return this.request("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  static getProject(id: string) {
    return this.request(`/api/v1/projects/${id}`);
  }

  static addVersion(projectId: string, data: { version_name: string; build_number?: number; changelog?: string }) {
    return this.request(`/api/v1/projects/${projectId}/versions`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Configurable Device Profiles
  static listDeviceProfiles() {
    return this.request("/api/v1/device-profiles");
  }

  static createDeviceProfile(data: any) {
    return this.request("/api/v1/device-profiles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  static getDeviceProfile(id: string) {
    return this.request(`/api/v1/device-profiles/${id}`);
  }

  static updateDeviceProfile(id: string, data: any) {
    return this.request(`/api/v1/device-profiles/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  static deleteDeviceProfile(id: string) {
    return this.request(`/api/v1/device-profiles/${id}`, {
      method: "DELETE",
    });
  }

  static duplicateDeviceProfile(id: string) {
    return this.request(`/api/v1/device-profiles/${id}/duplicate`, {
      method: "POST",
    });
  }

  // Engine A: Web Testing
  static runWebTest(data: {
    target_url: string;
    tier?: string;
    device_profile_ids?: string[];
    custom_profiles?: any[];
    project_id?: string;
    scenario_name?: string;
    is_demo?: boolean;
  }) {
    return this.request("/api/v1/tests/web/run", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  static getWebJobStatus(jobId: string) {
    return this.request(`/api/v1/tests/web/jobs/${jobId}`);
  }

  static cancelWebJob(jobId: string) {
    return this.request(`/api/v1/tests/web/jobs/${jobId}/cancel`, {
      method: "POST",
    });
  }

  // Engine B: Android Testing
  static getDeviceLabStatus() {
    return this.request("/api/v1/tests/android/device-status");
  }

  static uploadApk(formData: FormData) {
    return this.request("/api/v1/tests/android/upload-apk", {
      method: "POST",
      body: formData,
    });
  }

  static runAndroidTest(formData: FormData) {
    return this.request("/api/v1/tests/android/run", {
      method: "POST",
      body: formData,
    });
  }

  // Comparisons
  static getComparison(comparisonGroupId: string) {
    return this.request(`/api/v1/comparisons/${comparisonGroupId}`);
  }

  // Graph & Intelligence Explorer
  static getGraphStatus() {
    return this.request("/api/v1/graph/status");
  }

  static getGraphProjects() {
    return this.request("/api/v1/graph/projects");
  }

  static getGraphStats(projectId?: string) {
    const q = projectId && projectId !== "ALL" ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return this.request(`/api/v1/graph/stats${q}`);
  }

  static getExplorerGraph(params: { projectId?: string; nodeType?: string; search?: string; limit?: number } = {}) {
    const q = new URLSearchParams();
    if (params.projectId && params.projectId !== "ALL") q.set("project_id", params.projectId);
    if (params.nodeType && params.nodeType !== "ALL") q.set("node_type", params.nodeType);
    if (params.search) q.set("search", params.search);
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return this.request(`/api/v1/graph/explorer${qs ? `?${qs}` : ""}`);
  }

  static getFailurePatterns(projectId?: string) {
    const q = projectId && projectId !== "ALL" ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return this.request(`/api/v1/graph/failure-patterns${q}`);
  }

  static getDeviceImpact(projectId?: string) {
    const q = projectId && projectId !== "ALL" ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return this.request(`/api/v1/graph/device-impact${q}`);
  }

  static getRootCauseChains(limit: number = 50, projectId?: string) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (projectId && projectId !== "ALL") q.set("project_id", projectId);
    return this.request(`/api/v1/graph/root-causes?${q.toString()}`);
  }

  static getHistoricalRuns(params: { projectId?: string; status?: string; limit?: number } = {}) {
    const q = new URLSearchParams();
    if (params.projectId) q.set("project_id", params.projectId);
    if (params.status) q.set("status", params.status);
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return this.request(`/api/v1/graph/historical-runs${qs ? `?${qs}` : ""}`);
  }

  static getAuditReports(params: { targetUrl?: string; status?: string; limit?: number } = {}) {
    const q = new URLSearchParams();
    if (params.targetUrl) q.set("target_url", params.targetUrl);
    if (params.status) q.set("status", params.status);
    if (params.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return this.request(`/api/v1/tests/web/audit-reports${qs ? `?${qs}` : ""}`);
  }

  static getNodeDetails(nodeId: string) {
    return this.request(`/api/v1/graph/node/${encodeURIComponent(nodeId)}`);
  }

  static getProjectGraph(projectId: string) {
    return this.request(`/api/v1/graph/project/${projectId}`);
  }

  // RCA & Workflow
  static getRunRecommendations(runId: string) {
    return this.request(`/api/v1/rca/run/${runId}`);
  }

  static updateRecommendationStatus(recId: string, status: string) {
    return this.request(`/api/v1/rca/recommendations/${recId}/status`, {
      method: "POST",
      body: JSON.stringify({ new_status: status }),
    });
  }

  static verifyRecommendation(recId: string, verificationRunId: string) {
    return this.request(`/api/v1/rca/recommendations/${recId}/verify`, {
      method: "POST",
      body: JSON.stringify({ verification_run_id: verificationRunId }),
    });
  }
}
