/** Formatting helpers shared by every screen (deterministic, no Intl, so server and client markup match). */

const WEEKDAYS = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] };
const MONTHS = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"] };

/** Short weekday label for a day-of-week index (0 = Sunday). */
export function fmtWeekday(dow: number, locale: string) {
  return (locale === "ar" ? WEEKDAYS.ar : WEEKDAYS.en)[((dow % 7) + 7) % 7];
}

/** "Sun – Thu" for a contiguous run of days, otherwise "Sun, Tue, Thu". */
export function fmtWeekdays(days: readonly number[], locale: string): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 0) return "—";
  const contiguous = d.length >= 3 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return contiguous ? `${fmtWeekday(d[0], locale)} – ${fmtWeekday(d[d.length - 1], locale)}` : d.map((x) => fmtWeekday(x, locale)).join(locale === "ar" ? "، " : ", ");
}

/** "Thu 10 Sep" from an ISO date (a full timestamp is cut to its date). */
export function fmtDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  const l = locale === "ar" ? "ar" : "en";
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return l === "ar" ? `${WEEKDAYS.ar[dow]} ${d} ${MONTHS.ar[m - 1]}` : `${WEEKDAYS.en[dow]} ${d} ${MONTHS.en[m - 1]}`;
}

export function fmtMoney(n: number, _locale: string, currency = "USD") {
  const sym = currency === "USD" ? "$" : currency + " ";
  return sym + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
