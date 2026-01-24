import fs from "fs";
import path from "path";
import type { ChildProcess } from "child_process";

export const BULK_JOB_UPLOAD_DIR = "/srv/incoming-scripts/uploads";
export const BULK_JOB_FILE = path.join(BULK_JOB_UPLOAD_DIR, "bulk-jobs.json");
export const BULK_JOB_LOG_DIR =
  "/srv/node-tools/product-processor/logs";
export const BULK_JOB_RUNNER =
  "/srv/node-tools/product-processor/run-parallel-1688.js";
export const BULK_JOB_DRAFT_ROOT = "/srv/resources/media/images/draft_products";

export type BulkJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "killed";

export type BulkJobSummary = {
  spuCount: number;
  imageFolderCount: number | null;
  outputExcelPath: string | null;
  outputZipPath: string | null;
};

export type BulkJob = {
  jobId: string;
  status: BulkJobStatus;
  inputPath: string;
  inputName: string;
  itemCount: number;
  workerCount: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  pid?: number;
  runStamp?: string;
  parallelLogPath?: string;
  workerLogDir?: string;
  outputFolder?: string | null;
  outputExcelPath?: string | null;
  outputZipPath?: string | null;
  summary?: BulkJobSummary | null;
  error?: string | null;
};

const runningProcesses = new Map<string, ChildProcess>();

const ensureUploadDir = () => {
  fs.mkdirSync(BULK_JOB_UPLOAD_DIR, { recursive: true });
};

export const loadJobs = (): BulkJob[] => {
  ensureUploadDir();
  if (!fs.existsSync(BULK_JOB_FILE)) return [];
  try {
    const raw = fs.readFileSync(BULK_JOB_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BulkJob[]) : [];
  } catch {
    return [];
  }
};

export const saveJobs = (jobs: BulkJob[]) => {
  ensureUploadDir();
  fs.writeFileSync(BULK_JOB_FILE, JSON.stringify(jobs, null, 2), "utf8");
};

export const getJob = (jobId: string) =>
  loadJobs().find((job) => job.jobId === jobId) ?? null;

export const upsertJob = (job: BulkJob) => {
  const jobs = loadJobs();
  const idx = jobs.findIndex((entry) => entry.jobId === job.jobId);
  if (idx >= 0) jobs[idx] = job;
  else jobs.unshift(job);
  saveJobs(jobs);
  return job;
};

export const updateJob = (
  jobId: string,
  updater: (job: BulkJob) => BulkJob
) => {
  const jobs = loadJobs();
  const idx = jobs.findIndex((entry) => entry.jobId === jobId);
  if (idx < 0) return null;
  const updated = updater(jobs[idx]);
  jobs[idx] = updated;
  saveJobs(jobs);
  return updated;
};

export const registerProcess = (jobId: string, proc: ChildProcess) => {
  runningProcesses.set(jobId, proc);
  proc.on("close", () => runningProcesses.delete(jobId));
};

export const getProcess = (jobId: string) => runningProcesses.get(jobId);

export const removeProcess = (jobId: string) => {
  runningProcesses.delete(jobId);
};

export const countItems = (payload: unknown) => {
  if (Array.isArray(payload)) return payload.length;
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown[] }).items)
  ) {
    return (payload as { items: unknown[] }).items.length;
  }
  return 0;
};

const parseWorkerCount = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const WORKER_MIN = 1;
const WORKER_MAX = parseWorkerCount(process.env.BULK_JOB_MAX_WORKERS) ?? 4;
const WORKER_DEFAULT =
  parseWorkerCount(process.env.BULK_JOB_DEFAULT_WORKERS) ?? WORKER_MIN;

export const resolveWorkerCount = (
  itemCount: number,
  requested?: string | null
) => {
  const requestedCount = parseWorkerCount(requested);
  const base = requestedCount ?? WORKER_DEFAULT;
  const capped = Math.max(WORKER_MIN, Math.min(base, WORKER_MAX));
  if (Number.isFinite(itemCount) && itemCount > 0) {
    return Math.min(capped, itemCount);
  }
  return capped;
};

export const findRunStamp = (job: BulkJob) => {
  if (job.runStamp) return job.runStamp;
  if (!job.startedAt) return null;
  let files: string[] = [];
  try {
    files = fs.readdirSync(BULK_JOB_LOG_DIR);
  } catch {
    return null;
  }
  const startedAt = Date.parse(job.startedAt);
  const cutoff = Number.isFinite(startedAt) ? startedAt - 60_000 : 0;
  const candidates = new Map<string, number>();
  files.forEach((file) => {
    const match = file.match(/^run-(.+)-w\d+\.csv$/);
    if (!match) return;
    const baseStamp = match[1];
    const full = path.join(BULK_JOB_LOG_DIR, file);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) return;
      const current = candidates.get(baseStamp) ?? 0;
      candidates.set(baseStamp, Math.max(current, stat.mtimeMs));
    } catch {
      return;
    }
  });
  const sorted = [...candidates.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
};

export const buildWorkerLogPath = (runStamp: string, workerId: number) =>
  path.join(BULK_JOB_LOG_DIR, `run-${runStamp}-w${workerId}.csv`);

export const buildOutputPaths = (job: BulkJob, runStamp: string) => {
  const countTag = `${job.itemCount}-spu`;
  const finalFolderName = `Drafted-Products-${countTag}-${runStamp}`;
  const tempFolderName = `Drafted-Products-currently_running-${countTag}-${runStamp}`;
  const finalFolder = path.join(BULK_JOB_DRAFT_ROOT, finalFolderName);
  const tempFolder = path.join(BULK_JOB_DRAFT_ROOT, tempFolderName);
  return {
    finalFolder,
    tempFolder,
    outputExcel: path.join(
      finalFolder,
      `output-product_texts-${countTag}-${runStamp}.xlsx`
    ),
    outputZip: path.join(BULK_JOB_DRAFT_ROOT, `${finalFolderName}.zip`),
  };
};

export const countImageFolders = (folderPath: string) => {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const dirs = entries.filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith("_")
    );
    return dirs.length;
  } catch {
    return null;
  }
};

export const safeRemove = (targetPath: string) => {
  try {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }
  } catch {
    return;
  }
};
