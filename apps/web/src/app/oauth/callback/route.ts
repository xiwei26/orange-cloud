import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";

// OAuth 回调中转：Cloudflare 只接受 https redirect_uri，
// 此路由将授权码 302 透传给 App 的自定义 scheme。
// 不存 code、不换 Token、不验 state（验证在 App 端做，PKCE 保证安全）。
const DEFAULT_APP_CALLBACK = "orangecloud://oauth/callback";

function appCallbackFromEnv(env: unknown): URL {
	const configured = (env as { OAUTH_APP_CALLBACK?: string }).OAUTH_APP_CALLBACK?.trim();
	if (!configured) return new URL(DEFAULT_APP_CALLBACK);

	try {
		const callback = new URL(configured);
		// Relay 只能跳回自定义 App scheme，不能变成可被滥用的 HTTPS open redirect。
		if (callback.protocol === "http:" || callback.protocol === "https:") throw new Error("http callback");
		return callback;
	} catch {
		return new URL(DEFAULT_APP_CALLBACK);
	}
}

export async function GET(request: NextRequest) {
	const { env } = await getCloudflareContext({ async: true });
	const appCallback = appCallbackFromEnv(env);
	const { searchParams } = request.nextUrl;

	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const error = searchParams.get("error");

	// Cloudflare 返回错误（用户拒绝授权等）
	if (error) {
		const errorDesc = searchParams.get("error_description") ?? error;
		appCallback.searchParams.set("error", errorDesc);
		return NextResponse.redirect(appCallback.toString(), { status: 302 });
	}

	// 缺少必要参数
	if (!code || !state) {
		appCallback.searchParams.set("error", "invalid_response");
		return NextResponse.redirect(appCallback.toString(), { status: 302 });
	}

	appCallback.searchParams.set("code", code);
	appCallback.searchParams.set("state", state);

	return NextResponse.redirect(appCallback.toString(), { status: 302 });
}
