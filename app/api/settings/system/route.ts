import { NextResponse } from "next/server";
import os from "os";
import { execSync } from "child_process";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

const readDiskUsage = () => {
  try {
    const output = execSync("df -k /").toString("utf8").trim().split("\n");
    if (output.length < 2) return null;
    const parts = output[1].trim().split(/\s+/);
    if (parts.length < 6) return null;
    const total = Number(parts[1]) * 1024;
    const used = Number(parts[2]) * 1024;
    const free = Number(parts[3]) * 1024;
    const usedPercent = Number(String(parts[4] ?? "").replace("%", ""));
    return {
      total,
      used,
      free,
      usedPercent: Number.isFinite(usedPercent) ? usedPercent : null,
      mount: parts[5],
    };
  } catch {
    return null;
  }
};

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: settings } = await supabase
    .from("partner_user_settings")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!settings?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpuCount = os.cpus().length;
  const loadAvg = os.loadavg();
  const loadPercent = {
    one: cpuCount ? (loadAvg[0] / cpuCount) * 100 : 0,
    five: cpuCount ? (loadAvg[1] / cpuCount) * 100 : 0,
    fifteen: cpuCount ? (loadAvg[2] / cpuCount) * 100 : 0,
  };

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    cpuCount,
    loadAvg: {
      one: loadAvg[0],
      five: loadAvg[1],
      fifteen: loadAvg[2],
    },
    loadPercent,
    uptimeSeconds: os.uptime(),
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usedPercent: totalMem ? (usedMem / totalMem) * 100 : 0,
    },
    process: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
    },
    disk: readDiskUsage(),
  });
}
