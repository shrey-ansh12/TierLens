const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

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

  // Engine A: Web Testing
  static runWebTest(data: { target_url: string; tier: string; project_id?: string; scenario_name?: string; is_demo?: boolean }) {
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

  // Graph
  static getGraphStatus() {
    return this.request("/api/v1/graph/status");
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
