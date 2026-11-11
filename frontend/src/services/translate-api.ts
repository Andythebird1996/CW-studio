export async function autoTranslate(
  strings: string[],
  fromLang: string,
  toLang: string,
): Promise<string[]> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strings, fromLang, toLang }),
  });
  const text = await res.text();
  let data: any;
  try {
    data = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Ugyldig svar fra server: ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  if (!Array.isArray(data.translations)) {
    throw new Error(`Uventet svar fra oversettelsestjeneste: "translations" er ikke en liste (mottok ${JSON.stringify(data).slice(0, 200)})`);
  }
  return data.translations as string[];
}
