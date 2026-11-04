import type {
  ClickInput,
  CreateProfileInput,
  CreateProxyInput,
  EvaluateInput,
  GotoInput,
  NewPageInput,
  PageRefInput,
  PressInput,
  ProfileOs,
  ScreenshotInput,
  StartProfileInput,
  TypeInput,
  UpdateProfileInput,
  UpdateProxyInput,
  WaitForInput,
} from "./schemas.ts";
import type {
  RunWorkflowInput,
  WorkflowDefinition,
  WorkflowParam,
  WorkflowStep,
} from "./workflow.ts";

export type ProfileStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export interface ProxyCheck {
  ok: boolean;
  checkedAt: string;
  latencyMs?: number;
  ip?: string;
  country?: string;
  timezone?: string;
  locale?: string;
  error?: string;
}

/** Declared as a type alias (not an interface) so it satisfies the `Record<string, unknown>` row constraint of UI tables. */
export type Proxy = {
  id: string;
  name: string;
  /** Proxy URL with the password masked. */
  url: string;
  scheme: string;
  host: string;
  port: number;
  hasAuth: boolean;
  createdAt: string;
  lastCheck: ProxyCheck | null;
  /** Number of profiles bound to this proxy. */
  profileCount: number;
};

export interface IdentitySummary {
  os: ProfileOs;
  userAgent: string;
  screen: { width: number; height: number };
  webgl: { vendor: string; renderer: string };
}

export interface RuntimeInfo {
  status: ProfileStatus;
  headless: boolean;
  startedAt: string | null;
  pid: number | null;
  memoryMb: number | null;
  pageCount: number;
  lastError: string | null;
  /** Public IP seen through the proxy on the last launch. */
  ip: string | null;
}

/** Type alias for the same reason as {@link Proxy}. */
export type Profile = {
  id: string;
  name: string;
  group: string | null;
  notes: string | null;
  proxy: { id: string; name: string } | null;
  identity: IdentitySummary;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  runtime: RuntimeInfo;
};

export interface PageInfo {
  pageId: string;
  url: string;
  title: string;
  active: boolean;
}

export interface SnapshotResult {
  pageId: string;
  url: string;
  title: string;
  snapshot: string;
}

export interface ScreenshotResult {
  pageId: string;
  mimeType: "image/png";
  /** Base64 encoded image. */
  data: string;
}

export interface SystemStatus {
  version: string;
  dataDir: string;
  running: number;
  maxRunning: number;
  camoufox: { installed: boolean; version: string | null };
  /** Node `process.platform` of the daemon host. On "darwin", non-macOS fingerprints render garbled text in visible windows. */
  hostPlatform: string;
}

export type WorkflowSummary = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  params: Record<string, WorkflowParam>;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
};
export type Workflow = WorkflowSummary & { definition: WorkflowDefinition };

export type StepStatus = "ok" | "skipped" | "continued" | "failed";
/** Type alias (not an interface) so it satisfies the `Record<string, unknown>` row constraint of UI tables. */
export type StepLog = {
  path: string;
  id: string;
  do: string;
  status: StepStatus;
  branch?: string;
  error?: string;
  ms: number;
};
export type RunStatus = "succeeded" | "failed" | "needs_agent";
export interface WorkflowRunResult {
  workflow: string;
  version: number;
  profile: string;
  pageId: string;
  status: RunStatus;
  failedStep?: { path: string; id: string; error: string };
  outputs: Record<string, string>;
  screenshots: { stepId: string; data: string }[];
  log: StepLog[];
  snapshot?: string;
  durationMs: number;
}
export interface RecordingResult {
  steps: WorkflowStep[];
  warnings: string[];
}

/** Profile and proxy references accept either the id or the unique name. */
export interface PpbApi {
  status(): Promise<SystemStatus>;

  listProfiles(): Promise<Profile[]>;
  getProfile(ref: string): Promise<Profile>;
  createProfile(input: CreateProfileInput): Promise<Profile>;
  updateProfile(ref: string, input: UpdateProfileInput): Promise<Profile>;
  deleteProfile(ref: string): Promise<void>;
  startProfile(ref: string, input?: StartProfileInput): Promise<Profile>;
  stopProfile(ref: string): Promise<Profile>;

  listProxies(): Promise<Proxy[]>;
  createProxy(input: CreateProxyInput): Promise<Proxy>;
  updateProxy(ref: string, input: UpdateProxyInput): Promise<Proxy>;
  deleteProxy(ref: string): Promise<void>;
  importProxies(
    text: string,
  ): Promise<{ created: Proxy[]; errors: { line: number; error: string }[] }>;
  checkProxy(ref: string): Promise<ProxyCheck>;

  listPages(ref: string): Promise<PageInfo[]>;
  newPage(ref: string, input?: NewPageInput): Promise<PageInfo>;
  closePage(ref: string, pageId: string): Promise<void>;
  goto(ref: string, input: GotoInput): Promise<PageInfo>;
  snapshot(ref: string, input?: PageRefInput): Promise<SnapshotResult>;
  click(ref: string, input: ClickInput): Promise<PageInfo>;
  type(ref: string, input: TypeInput): Promise<PageInfo>;
  press(ref: string, input: PressInput): Promise<PageInfo>;
  screenshot(ref: string, input?: ScreenshotInput): Promise<ScreenshotResult>;
  evaluate(ref: string, input: EvaluateInput): Promise<{ pageId: string; result: unknown }>;
  waitFor(ref: string, input: WaitForInput): Promise<PageInfo>;

  listWorkflows(): Promise<WorkflowSummary[]>;
  getWorkflow(ref: string): Promise<Workflow>;
  saveWorkflow(definition: WorkflowDefinition): Promise<Workflow>;
  deleteWorkflow(ref: string): Promise<void>;
  runWorkflow(ref: string, input: RunWorkflowInput): Promise<WorkflowRunResult>;
  startRecording(ref: string): Promise<void>;
  stopRecording(ref: string): Promise<RecordingResult>;
}
