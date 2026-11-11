import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';

const translate = new Hono();

const LANG_NAMES: Record<string, string> = {
  NO: 'Norwegian Bokmål',
  EN: 'English',
  SV: 'Swedish',
  DA: 'Danish',
  FI: 'Finnish',
  DE: 'German',
  FR: 'French',
  PL: 'Polish',
};

translate.post('/', async (c) => {
  try {
    const { strings, fromLang, toLang } = await c.req.json<{
      strings: string[];
      fromLang: string;
      toLang: string;
    }>();

    if (!strings?.length) return c.json({ translations: [] });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    const fromName = LANG_NAMES[fromLang] ?? fromLang;
    const toName = LANG_NAMES[toLang] ?? toLang;

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: `You are a professional medical/psychological assessment translator specializing in clinical questionnaires.

Translate the following ${fromName} strings to ${toName}. These are labels, questions and answer options from a clinical assessment tool.

Rules:
- Return ONLY a valid JSON array with exactly ${strings.length} strings
- Keep the same order as input
- Preserve any HTML tags (e.g. <b>, <i>) and special formatting exactly
- Use formal/clinical language appropriate for healthcare settings
- Do not add explanations or comments

Input strings:
${JSON.stringify(strings, null, 2)}`,
        },
      ],
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Extract JSON array — Claude sometimes wraps in markdown code blocks
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('AI returned unexpected format');

    const translations = JSON.parse(match[0]) as string[];
    if (!Array.isArray(translations) || translations.length !== strings.length) {
      throw new Error(`Expected ${strings.length} translations, got ${translations.length}`);
    }

    return c.json({ translations });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default translate;
