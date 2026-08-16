import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

/**
 * 按操作解析一个凭据引用：凭据 seam（ctx.credentials）优先，缺失时回退到
 * launch 环境读取，都没有则抛出自助配置指引错误。每次工具执行都调用，
 * 因此改完凭据下一次调用立即生效，无需重启（与 llm-deepseek 一致）。
 */
export async function resolveCredential(
  ctx: Context,
  refName: string,
  purpose: string,
): Promise<string> {
  const ref = credentialRef(refName)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const hit = await credentials.resolve(ref)
    if (hit !== undefined && hit.value !== '') return hit.value
  } else {
    const ambient = launchEnvironmentOf(ctx).get(ref)
    if (ambient !== undefined && ambient.value.length > 0) return ambient.value
  }
  throw new Error(
    `yuque-notes: 未配置${purpose}。请将 ${refName} 写入凭据存储`
    + '（web 设置页或 $DSH_HOME/.credentials.yaml），'
    + `或在启动 dsh 的环境中 export ${refName}。`,
  )
}
