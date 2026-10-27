// ============================================================================
// 标题文本清洗与相似度判定
// 主进程（搜索结果入库 / 歌词候选评分）与渲染进程（歌词校验）共用同一套规则，
// 避免两边各写一份实现导致口径漂移。
// ============================================================================

/** B 站搜索接口会把命中词包成 <em class="keyword">，必须先剥掉再入库/匹配 */
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

/** 去 HTML 标签 + 反转义常见实体 + 空白折叠 */
export function stripHtml(input: string): string {
  if (!input) return ''
  const out = input
    .replace(HTML_TAG_RE, '')
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => NAMED_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * 归一化：小写 + 去掉全部标点/符号/空白。
 * 用 Unicode 类别一次覆盖半角与全角（｜／～－·、【】《》× ※ 等）以及 emoji，
 * 不再靠手写字符类慢慢补漏。
 */
export function normalizeTitle(s: string): string {
  if (!s) return ''
  return stripHtml(s)
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

/** 字符重叠比例（0..1），按集合计，与顺序无关 */
export function charOverlap(a: string, b: string): number {
  if (!a || !b) return 0
  const set = new Set(a)
  let common = 0
  for (const ch of b) if (set.has(ch)) common++
  return common / Math.max(a.length, b.length)
}

/**
 * 去掉候选/元数据侧的版本与附注标记："夜曲 - A35" / "晴天 (Live)" / "Love Story (DJ版)"。
 * 只用于「候选歌名」「歌词 [ti:] 元数据」这类短字符串——
 * 绝不能用在 B 站视频标题上：标题里的连字符（如 "【Hi-Res】… - 某某"）会把有价值的内容整段截掉。
 */
export function stripVersionSuffix(s: string): string {
  return stripHtml(s)
    .replace(/[-—–|/].*$/, '')
    .replace(/[（(【[〔].*?[）)】\]〕]/g, '')
    .trim()
}

/**
 * 两个歌名是否可视为同一首：归一后相等 / 互相包含 / 字符重叠达标。
 * 目标标题通常是冗长的 B 站视频标题，靠「包含」判定即可，
 * 因此这里不做任何截断式清洗。
 */
export function titlesMatch(a: string, b: string, minOverlap = 0.55): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  return charOverlap(na, nb) >= minOverlap
}

/**
 * 版本标记：带这些字样的歌词属于「另一种语言的填词 / 翻唱 / 无人声」，
 * 正文与原版不同，不能拿来当原版歌词用。
 */
const ALT_VERSION_RE =
  /中文版|中文填词|填词版|国语版|粤语版|日语版|英文版|方言版|翻唱|cover|伴奏|纯音乐|inst(?:rumental)?/i

export function hasAltVersionMark(s: string): boolean {
  return ALT_VERSION_RE.test(s)
}
