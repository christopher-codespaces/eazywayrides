import { NextResponse } from "next/server";

type AIJobDraft = {
  title: string;
  description: string;
  location: string;
  vehicleType: "Car" | "Bike" | "Scooter" | "Truck" | "Van";
  pay: number; // rands
  expiryDays: number; // number of days from today
};

function safeString(v: any, fallback = ""): string {
  if (typeof v === "string") return v.trim();
  return fallback;
}

function safeNumber(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeVehicleType(v: any): AIJobDraft["vehicleType"] {
  const s = safeString(v).toLowerCase();
  if (s.includes("bike")) return "Bike";
  if (s.includes("scooter")) return "Scooter";
  if (s.includes("truck")) return "Truck";
  if (s.includes("van")) return "Van";
  return "Car";
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENROUTER_API_KEY on server." },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => null);
    const prompt = safeString(body?.prompt);

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt." }, { status: 400 });
    }

    // Strong instruction: return JSON only, no markdown.
    const system = `
You help a South African business post a delivery/driver job on EazyWayRides.

Return ONLY valid JSON (no markdown, no extra text) with:
{
  "title": string,
  "description": string,
  "location": string,
  "vehicleType": one of ["Car","Bike","Scooter","Truck","Van"],
  "pay": number (in ZAR),
  "expiryDays": number (1-30)
}

Rules:
- Keep title short and specific.
- Description: 3-7 sentences, practical, includes schedule/requirements if hinted.
- If pay is unclear, make a reasonable estimate and mention it in description.
- expiryDays default 7 if unclear.
`;

    const user = `
Business notes / rough input:
${prompt}

Return JSON only.
`;

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Optional, but recommended by OpenRouter:
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "EazyWayRides",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json(
        { error: `OpenRouter error: ${r.status}`, detail: txt },
        { status: 500 },
      );
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "AI response missing content." },
        { status: 500 },
      );
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Sometimes models return extra whitespace; try to salvage a JSON block.
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsed = JSON.parse(content.slice(start, end + 1));
      }
    }

    if (!parsed) {
      return NextResponse.json(
        { error: "Failed to parse AI JSON output." },
        { status: 500 },
      );
    }

    const draft: AIJobDraft = {
      title: safeString(parsed.title, "Delivery Driver Needed"),
      description: safeString(parsed.description, ""),
      location: safeString(parsed.location, ""),
      vehicleType: normalizeVehicleType(parsed.vehicleType),
      pay: clamp(safeNumber(parsed.pay, 300), 50, 50000),
      expiryDays: clamp(safeNumber(parsed.expiryDays, 7), 1, 30),
    };

    return NextResponse.json({ draft });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error." },
      { status: 500 },
    );
  }
}
