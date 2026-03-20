/**
 * Beads (bd) command wrappers for plan mode
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BdCreateResult, BdIssue, IssueType, IssuePriority } from "./types.js";

export async function runBd(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
	return new Promise((resolve) => {
		try {
			const proc = spawn("bd", args, { cwd, shell: true });
			let stdout = "";
			let stderr = "";
			proc.stdout?.on("data", (d) => (stdout += d.toString()));
			proc.stderr?.on("data", (d) => (stderr += d.toString()));
			proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
			proc.on("error", (err) => {
				stderr = `Failed to spawn bd: ${err.message}`;
				resolve({ stdout, stderr, code: 1 });
			});
		} catch (err: any) {
			resolve({ stdout: "", stderr: err.message || "Unknown error", code: 1 });
		}
	});
}

export async function bdCreateEpic(title: string, priority: IssuePriority, cwd: string): Promise<BdCreateResult | null> {
	const result = await runBd(["create", `"${title.replace(/"/g, '\\"')}"`, "-t", "epic", "-p", String(priority), "--json"], cwd);
	if (result.code !== 0) return null;
	try {
		const parsed = JSON.parse(result.stdout);
		const id = parsed?.id || parsed?.[0]?.id;
		if (id) return { id, title, success: true };
	} catch {}
	return null;
}

export async function bdCreateIssue(
	title: string,
	type: IssueType,
	priority: IssuePriority,
	parentId: string,
	cwd: string,
	description?: string,
	deps?: string[]
): Promise<BdCreateResult | null> {
	const args = ["create", `"${title.replace(/"/g, '\\"')}"`, "-t", type, "-p", String(priority), "--parent", parentId, "--json"];
	if (description) args.push("-d", `"${description.replace(/"/g, '\\"')}"`);
	if (deps && deps.length > 0) args.push("--deps", deps.map(d => `blocked-by:${d}`).join(","));

	const result = await runBd(args, cwd);
	if (result.code !== 0) return null;
	try {
		const parsed = JSON.parse(result.stdout);
		const id = parsed?.id || parsed?.[0]?.id;
		if (id) return { id, title, success: true };
	} catch {}
	return null;
}

export async function bdReady(cwd: string): Promise<BdIssue[]> {
	const result = await runBd(["ready", "--json"], cwd);
	if (result.code !== 0) return [];
	try {
		return JSON.parse(result.stdout) || [];
	} catch {
		return [];
	}
}

export async function bdShow(issueId: string, cwd: string): Promise<BdIssue | null> {
	const result = await runBd(["show", issueId, "--json"], cwd);
	if (result.code !== 0) return null;
	try {
		const parsed = JSON.parse(result.stdout);
		return parsed?.[0] || parsed || null;
	} catch {
		return null;
	}
}

export async function bdClaim(issueId: string, cwd: string): Promise<boolean> {
	const result = await runBd(["update", issueId, "--claim", "--json"], cwd);
	return result.code === 0;
}

export async function bdClose(issueId: string, reason: string, cwd: string): Promise<boolean> {
	const result = await runBd(["close", issueId, "--reason", `"${reason.replace(/"/g, '\\"')}"`], cwd);
	return result.code === 0;
}

export async function bdChildren(parentId: string, cwd: string): Promise<BdIssue[]> {
	const result = await runBd(["children", parentId, "--json"], cwd);
	if (result.code !== 0) return [];
	try {
		return JSON.parse(result.stdout) || [];
	} catch {
		return [];
	}
}

export async function bdList(cwd: string): Promise<{ open: number; inProgress: number }> {
	const result = await runBd(["list"], cwd);
	const m = result.stdout.match(/Total:\s*\d+\s+issues?\s*\((\d+)\s+open,\s*(\d+)\s+in progress\)/);
	if (m) return { open: parseInt(m[1], 10), inProgress: parseInt(m[2], 10) };
	return { open: 0, inProgress: 0 };
}

export function isBeadsProject(cwd: string): boolean {
	return existsSync(join(cwd, ".beads"));
}
